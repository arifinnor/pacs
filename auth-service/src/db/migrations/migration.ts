import { PoolClient } from 'pg';

export interface Migration {
  up(client: PoolClient): Promise<void>;
  down(client: PoolClient): Promise<void>;
}
