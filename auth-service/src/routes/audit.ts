import { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';

interface AuditBody {
  userId: string;
  userRole?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  patientId?: string;
  ipAddress?: string;
  success: boolean;
  details?: string;
}

export async function auditRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: AuditBody }>('/audit', {
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'action', 'success'],
        properties: {
          userId:       { type: 'string' },
          userRole:     { type: 'string' },
          action:       { type: 'string' },
          resourceType: { type: 'string' },
          resourceId:   { type: 'string' },
          patientId:    { type: 'string' },
          ipAddress:    { type: 'string' },
          success:      { type: 'boolean' },
          details:      { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const b = request.body;
    await query(
      `INSERT INTO audit_log
         (user_id, user_role, action, resource_type, resource_id, patient_id, ip_address, success, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        b.userId,
        b.userRole ?? null,
        b.action,
        b.resourceType ?? null,
        b.resourceId ?? null,
        b.patientId ?? null,
        b.ipAddress ?? null,
        b.success,
        b.details ?? null,
      ]
    );
    return reply.code(204).send();
  });
}
