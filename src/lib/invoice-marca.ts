export interface ClassificationForMarca {
  project: { workspace: { name: string } } | null;
  marca: string | null;
}

export function deriveMarcaFromClassifications(
  classifications: ClassificationForMarca[],
): string | null {
  if (classifications.length === 0) return null;

  const marcas = [
    ...new Set([
      ...classifications
        .filter((c) => c.project)
        .map((c) => c.project!.workspace.name),
      ...classifications
        .filter((c) => !c.project && c.marca)
        .map((c) => c.marca!),
      ...classifications
        .filter((c) => !c.project && !c.marca)
        .map(() => "Awesomely"),
    ]),
  ].sort();

  return marcas.length > 0 ? marcas.join(",") : null;
}
