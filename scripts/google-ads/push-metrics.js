/**
 * ERP Gigson · volcado de métricas de Google Ads → POST /api/webhooks/ads-metrics
 * ================================================================================
 *
 * Google Ads Script (se pega en Google Ads → Herramientas → Acciones en bloque → Scripts
 * y se programa a diario). Versión de referencia en el repo del ERP:
 *   scripts/google-ads/push-metrics.js  (instrucciones en scripts/google-ads/README.md)
 *
 * Qué hace: lee los últimos LOOKBACK_DAYS días de la cuenta en la que corre y los envía
 * al ERP en tres lotes — campañas (metadatos + filas diarias), keywords y términos de
 * búsqueda — troceados en partes de BATCH_ROWS filas. Reescribe siempre la ventana entera
 * porque Google Ads rellena las conversiones hacia atrás durante varios días: apilar la
 * fila de ayer dejaría la semana pasada mal.
 *
 * Qué NO hace: no toca la cuenta (solo lectura), no decide nada. El cruce con los leads
 * del CRM, el CPL y el semáforo se calculan en el ERP.
 *
 * Configuración (Script Properties, en el editor: Configuración del proyecto → Propiedades):
 *   ERP_URL             https://<host-del-erp>/api/webhooks/ads-metrics   (obligatoria)
 *   ERP_WEBHOOK_SECRET  el valor de ADS_WEBHOOK_SECRET del ERP            (obligatoria)
 *   LOOKBACK_DAYS       opcional, por defecto 60 (para un backfill puntual: 365)
 *   NOTIFY_EMAIL        opcional: a quién avisar si algún lote falla
 *
 * Nada sensible va en este fichero: el repo es visible para más gente que la cuenta de Ads.
 */

var SCRIPT_VERSION = '2026-10-16';
var DEFAULT_LOOKBACK_DAYS = 60;
var BATCH_ROWS = 2000;
var RETRY_WAIT_MS = 2000;

function main() {
  var props = PropertiesService.getScriptProperties();
  var erpUrl = props.getProperty('ERP_URL');
  var secret = props.getProperty('ERP_WEBHOOK_SECRET');
  if (!erpUrl || !secret) {
    throw new Error('Faltan las Script Properties ERP_URL y/o ERP_WEBHOOK_SECRET');
  }
  var lookbackDays = parseInt(props.getProperty('LOOKBACK_DAYS') || '', 10) || DEFAULT_LOOKBACK_DAYS;
  var notifyEmail = props.getProperty('NOTIFY_EMAIL') || '';

  var account = AdsApp.currentAccount();
  var tz = account.getTimeZone();
  var today = new Date();
  var yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  var from = new Date(today.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  var dateFrom = formatDate(from, tz);
  var dateTo = formatDate(yesterday, tz);

  var ctx = {
    runId: Utilities.getUuid(),
    scriptVersion: SCRIPT_VERSION,
    account: {
      externalId: account.getCustomerId().replace(/-/g, ''),
      name: account.getName(),
      currency: account.getCurrencyCode(),
    },
    dateFrom: dateFrom,
    dateTo: dateTo,
    erpUrl: erpUrl,
    secret: secret,
    failures: [],
  };

  Logger.log('Run %s · cuenta %s · %s → %s', ctx.runId, ctx.account.externalId, dateFrom, dateTo);

  // Orden importa: el ERP crea las campañas con el primer lote y los otros dos cuelgan de ellas.
  var campaigns = readCampaigns();
  sendInBatches(ctx, 'campaigns', readCampaignDaily(dateFrom, dateTo), { campaigns: campaigns });
  sendInBatches(ctx, 'keywords', readKeywords(dateFrom, dateTo, dateTo), {});
  sendInBatches(ctx, 'search_terms', readSearchTerms(dateFrom, dateTo), {});

  if (ctx.failures.length > 0) {
    var msg = 'Fallaron ' + ctx.failures.length + ' lote(s):\n' + ctx.failures.join('\n');
    Logger.log(msg);
    if (notifyEmail) {
      MailApp.sendEmail(notifyEmail, '[ERP] Volcado de Google Ads con errores (' + ctx.account.externalId + ')', msg);
    }
    throw new Error(msg);
  }
  Logger.log('Volcado completado sin errores.');
}

// ─── Lectura (GAQL) ───────────────────────────────────────────────────────────

function readCampaigns() {
  var query =
    'SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros ' +
    'FROM campaign WHERE campaign.status != "REMOVED"';
  var out = [];
  var rows = AdsApp.report(query).rows();
  while (rows.hasNext()) {
    var r = rows.next();
    out.push({
      externalId: String(r['campaign.id']),
      name: String(r['campaign.name']),
      status: normalizeStatus(r['campaign.status']),
      dailyBudgetEur: microsToEur(r['campaign_budget.amount_micros']),
    });
  }
  return out;
}

function readCampaignDaily(dateFrom, dateTo) {
  // Si la cuenta no tiene volumen para las cuotas de impresiones, Google devuelve null y
  // el ERP lo acepta. Si la consulta fallara por esos campos, quitarlos de aquí: las
  // columnas del ERP admiten null.
  var query =
    'SELECT campaign.id, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, ' +
    'metrics.conversions, metrics.conversions_value, campaign_budget.amount_micros, ' +
    'metrics.search_impression_share, metrics.search_budget_lost_impression_share, ' +
    'metrics.search_rank_lost_impression_share ' +
    'FROM campaign WHERE segments.date BETWEEN "' + dateFrom + '" AND "' + dateTo + '"';
  var out = [];
  var rows = AdsApp.report(query).rows();
  while (rows.hasNext()) {
    var r = rows.next();
    out.push({
      campaignExternalId: String(r['campaign.id']),
      date: String(r['segments.date']),
      impressions: toInt(r['metrics.impressions']),
      clicks: toInt(r['metrics.clicks']),
      costEur: microsToEur(r['metrics.cost_micros']) || 0,
      conversions: toFloat(r['metrics.conversions']),
      conversionValueEur: toFloat(r['metrics.conversions_value']),
      dailyBudgetEur: microsToEur(r['campaign_budget.amount_micros']),
      searchImprShare: toShare(r['metrics.search_impression_share']),
      lostIsBudget: toShare(r['metrics.search_budget_lost_impression_share']),
      lostIsRank: toShare(r['metrics.search_rank_lost_impression_share']),
    });
  }
  return out;
}

function readKeywords(dateFrom, dateTo, qualityScoreDate) {
  // quality_score es un valor ACTUAL, no histórico: solo se envía en la fila del último día
  // para que el ERP lo muestre como "QS hoy" y no lo mezcle con días pasados.
  var query =
    'SELECT campaign.id, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ' +
    'ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ' +
    'ad_group_criterion.quality_info.quality_score, segments.date, ' +
    'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions ' +
    'FROM keyword_view WHERE segments.date BETWEEN "' + dateFrom + '" AND "' + dateTo + '" ' +
    'AND metrics.impressions > 0';
  var out = [];
  var rows = AdsApp.report(query).rows();
  while (rows.hasNext()) {
    var r = rows.next();
    var date = String(r['segments.date']);
    out.push({
      campaignExternalId: String(r['campaign.id']),
      adGroupId: String(r['ad_group.id']),
      adGroupName: String(r['ad_group.name']),
      criterionId: String(r['ad_group_criterion.criterion_id']),
      keywordText: String(r['ad_group_criterion.keyword.text']),
      matchType: String(r['ad_group_criterion.keyword.match_type'] || 'UNKNOWN'),
      date: date,
      impressions: toInt(r['metrics.impressions']),
      clicks: toInt(r['metrics.clicks']),
      costEur: microsToEur(r['metrics.cost_micros']) || 0,
      conversions: toFloat(r['metrics.conversions']),
      qualityScore: date === qualityScoreDate ? toQualityScore(r['ad_group_criterion.quality_info.quality_score']) : null,
    });
  }
  return out;
}

function readSearchTerms(dateFrom, dateTo) {
  var query =
    'SELECT campaign.id, ad_group.id, ad_group.name, search_term_view.search_term, ' +
    'search_term_view.status, segments.search_term_match_type, segments.date, ' +
    'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions ' +
    'FROM search_term_view WHERE segments.date BETWEEN "' + dateFrom + '" AND "' + dateTo + '"';
  var out = [];
  var rows = AdsApp.report(query).rows();
  while (rows.hasNext()) {
    var r = rows.next();
    out.push({
      campaignExternalId: String(r['campaign.id']),
      adGroupId: String(r['ad_group.id']),
      adGroupName: String(r['ad_group.name']),
      searchTerm: String(r['search_term_view.search_term']),
      matchType: String(r['segments.search_term_match_type'] || 'UNKNOWN'),
      status: r['search_term_view.status'] ? String(r['search_term_view.status']) : null,
      date: String(r['segments.date']),
      impressions: toInt(r['metrics.impressions']),
      clicks: toInt(r['metrics.clicks']),
      costEur: microsToEur(r['metrics.cost_micros']) || 0,
      conversions: toFloat(r['metrics.conversions']),
    });
  }
  return out;
}

// ─── Envío ────────────────────────────────────────────────────────────────────

function sendInBatches(ctx, kind, rows, extra) {
  var parts = Math.max(1, Math.ceil(rows.length / BATCH_ROWS));
  for (var part = 1; part <= parts; part++) {
    var slice = rows.slice((part - 1) * BATCH_ROWS, part * BATCH_ROWS);
    var body = {
      kind: kind,
      runId: ctx.runId,
      scriptVersion: ctx.scriptVersion,
      account: ctx.account,
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
      part: part,
      parts: parts,
      rows: slice,
    };
    // Los metadatos de campaña solo hacen falta una vez; en las partes siguientes van vacíos.
    if (kind === 'campaigns') body.campaigns = part === 1 ? extra.campaigns : [];

    var ok = postWithRetry(ctx, body);
    Logger.log('%s parte %s/%s · %s filas · %s', kind, part, parts, slice.length, ok ? 'OK' : 'ERROR');
    if (!ok) ctx.failures.push(kind + ' parte ' + part + '/' + parts);
  }
}

function postWithRetry(ctx, body) {
  for (var attempt = 1; attempt <= 2; attempt++) {
    var response = UrlFetchApp.fetch(ctx.erpUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-webhook-secret': ctx.secret },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) return true;
    Logger.log('HTTP %s en intento %s: %s', code, attempt, response.getContentText().slice(0, 500));
    // Un 4xx es un problema del payload o del secreto: reintentar no lo arregla.
    if (code >= 400 && code < 500) return false;
    Utilities.sleep(RETRY_WAIT_MS);
  }
  return false;
}

// ─── Normalización ────────────────────────────────────────────────────────────

function formatDate(date, tz) {
  return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
}

function normalizeStatus(value) {
  var s = String(value || '').toUpperCase();
  return s === 'ENABLED' || s === 'PAUSED' || s === 'REMOVED' ? s : 'UNKNOWN';
}

function toInt(value) {
  var n = parseInt(String(value == null ? '0' : value), 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

function toFloat(value) {
  var n = parseFloat(String(value == null ? '0' : value));
  return isNaN(n) || n < 0 ? 0 : n;
}

/** micros → EUR con dos decimales; null si Google no manda el valor. */
function microsToEur(value) {
  if (value == null || value === '') return null;
  var n = parseFloat(String(value));
  if (isNaN(n)) return null;
  return Math.round(n / 10000) / 100;
}

/** Cuotas de impresiones: Google devuelve 0-1, "< 10%" como 0.0999, o nada. */
function toShare(value) {
  if (value == null || value === '' || value === '--') return null;
  var n = parseFloat(String(value));
  if (isNaN(n)) return null;
  if (n > 1) n = n / 100; // por si algún informe las devuelve en porcentaje
  if (n < 0 || n > 1) return null;
  return Math.round(n * 10000) / 10000;
}

function toQualityScore(value) {
  var n = parseInt(String(value == null ? '' : value), 10);
  return isNaN(n) || n < 1 || n > 10 ? null : n;
}
