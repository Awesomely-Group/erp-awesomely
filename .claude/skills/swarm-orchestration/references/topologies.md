# Swarm Topologies Reference

## Hierarchical Topology
```
       Coordinator
      /     |     \
   Agent1  Agent2  Agent3
   /    \
Sub1   Sub2
```
- **Use when**: Complex multi-step tasks with clear dependencies
- **Pros**: Clear chain of command, easy to reason about
- **Cons**: Coordinator bottleneck, higher latency for deep hierarchies

## Mesh Topology
```
  Agent1 --- Agent2
    |    \ /    |
    |    / \    |
  Agent3 --- Agent4
```
- **Use when**: Independent parallel tasks, peer-to-peer coordination
- **Pros**: Low latency, fault tolerant, no single point of failure
- **Cons**: Complex state management, potential conflicts

## Ring Topology
```
  Agent1 → Agent2 → Agent3
    ↑                  ↓
  Agent5 ← Agent4 ←───┘
```
- **Use when**: Sequential pipeline processing (e.g., code → test → review → deploy)
- **Pros**: Ordered execution, predictable flow
- **Cons**: Single point of failure breaks the ring

## Star Topology
```
        Agent2
         |
Agent1 ─ Hub ─ Agent3
         |
        Agent4
```
- **Use when**: Centralized coordination with specialized workers
- **Pros**: Simple routing, easy to add/remove agents
- **Cons**: Hub is single point of failure and potential bottleneck

## Hybrid Topology
Combines multiple topologies. Example: hierarchical coordinators with mesh workers.
```
     Coordinator
      /       \
  SubCoord1  SubCoord2
   / mesh \   / mesh \
  A1  A2  A3 A4  A5  A6
```
- **Use when**: Mixed workloads requiring both coordination and parallelism
- **Pros**: Flexible, optimized per-layer
- **Cons**: Complex setup, harder to debug

## Consensus Algorithms

| Algorithm | Best For | Fault Tolerance |
|-----------|----------|-----------------|
| **Raft** | Leader election, log replication | Tolerates minority failures |
| **PBFT** | Byzantine fault tolerance | Tolerates f < n/3 malicious |
| **Gossip** | Eventual consistency, large swarms | High availability |
| **CRDT** | Conflict-free replicated data | Always mergeable |
| **Voting** | Simple majority decisions | Tolerates minority failures |
