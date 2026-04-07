import { PoolClient } from 'pg';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id            BIGSERIAL PRIMARY KEY,
      timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id       VARCHAR(255) NOT NULL,
      user_role     VARCHAR(100),
      action        VARCHAR(100) NOT NULL,
      resource_type VARCHAR(100),
      resource_id   VARCHAR(255),
      patient_id    VARCHAR(255),
      ip_address    VARCHAR(45),
      success       BOOLEAN NOT NULL DEFAULT TRUE,
      details       TEXT
    );
  `);
  await client.query('CREATE INDEX IF NOT EXISTS idx_audit_timestamp  ON audit_log (timestamp);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_audit_user_id    ON audit_log (user_id);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_audit_patient_id ON audit_log (patient_id);');
  // Prevent app user from deleting audit records (append-only — PMK 24/2022 compliance)
  await client.query('REVOKE DELETE ON audit_log FROM orthanc;').catch((err) => {
    console.warn('WARNING: Failed to revoke DELETE on audit_log from orthanc user. ' +
      'Audit trail may not be append-only, which violates PMK 24/2022 compliance requirements.', err);
  });
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS audit_log CASCADE;');
}
