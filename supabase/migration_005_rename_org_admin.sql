-- Migration 005: Rename org_admin role to user_manager
UPDATE roles SET name = 'user_manager', description = 'Gestione Utenti' WHERE name = 'org_admin';
