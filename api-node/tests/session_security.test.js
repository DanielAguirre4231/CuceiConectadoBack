const request = require('supertest');
const app = require('../src/server');
const pool = require('../src/db');
const jwt = require('jsonwebtoken');

describe('Prueba de Seguridad de Sesiones y Autenticación JWT', () => {
  afterAll(async () => {
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  });

  test('1. Debe rechazar peticiones sin encabezado Authorization (HTTP 401)', async () => {
    const res = await request(app)
      .post('/api/posts/create')
      .send({
        content_post: 'Intento de publicación sin token de sesión.',
        id_group: 1
      });

    expect([401, 403]).toContain(res.statusCode);
  });

  test('2. Debe rechazar peticiones con un token JWT alterado o firmado con clave falsa (HTTP 401/403)', async () => {
    // Token firmado con una clave secreta incorrecta
    const fakeToken = jwt.sign(
      { id: '5b3b8a7a-b7ac-4909-9218-6cd28171595c', email: 'atracador@udg.mx' },
      'clave_completamente_falsa_123',
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .post('/api/posts/create')
      .set('Authorization', `Bearer ${fakeToken}`)
      .send({
        content_post: 'Intento de vulneración con firma alterada.',
        id_group: 1
      });

    expect([401, 403]).toContain(res.statusCode);
  });

  test('3. Debe rechazar peticiones con un token JWT expirado (HTTP 401/403)', async () => {
    // Token configurado con tiempo expirado (-1 segundo)
    const expiredToken = jwt.sign(
      { id: '5b3b8a7a-b7ac-4909-9218-6cd28171595c', email: 'estudiante@alumnos.udg.mx' },
      process.env.JWT_SECRET || 'cucei_conectado_clave_secreta_desarrollo_2026',
      { expiresIn: '-1s' }
    );

    const res = await request(app)
      .post('/api/posts/create')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({
        content_post: 'Intento con token vencido.',
        id_group: 1
      });

    expect([401, 403]).toContain(res.statusCode);
  });
});