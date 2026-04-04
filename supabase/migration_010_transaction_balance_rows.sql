-- Migration 010: Transaction balance rows + drop value_date
-- Aggiunge supporto per righe di saldo nei movimenti
-- Rimuove il campo value_date non più utilizzato

ALTER TABLE transactions ADD COLUMN is_balance_row boolean NOT NULL DEFAULT false;
ALTER TABLE transactions DROP COLUMN IF EXISTS value_date;
