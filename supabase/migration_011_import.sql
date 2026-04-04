-- Migration 011: Import — add reclassification_node_id to transactions
-- Permette di collegare ogni movimento a una foglia del piano dei conti riclassificato

ALTER TABLE transactions
  ADD COLUMN reclassification_node_id uuid
    REFERENCES reclassification_nodes(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_reclassification_node ON transactions(reclassification_node_id);
