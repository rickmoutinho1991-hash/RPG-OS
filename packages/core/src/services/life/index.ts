/**
 * RPG-OS — Life Services (A Minha Vida)
 *
 * Camada de agregação cross-domain. Implementação inicial síncrona
 * (sem event bus, sem Kafka/Redis).
 */
export * from "./LifePriority";
export * from "./LifeActionDispatcher";
export * from "./LifeAggregationService";
export * from "./LifeCollectors";
