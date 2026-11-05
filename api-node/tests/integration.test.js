const request = require('supertest');
const app = require('../src/server');
const pool = require('../src/db');
const jwt = require('jsonwebtoken');

describe('Prueba de Integración: Flujo Completo de Publicación', () => {
  let token;
  let createdPostId;

  const REAL_USER_ID = '5b3b8a7a-b7ac-4909-9218-6cd28171595c';
  const REAL_GROUP_ID = '0aa020d3-b5b0-479f-8f30-4a0090153ca4';

  beforeAll(() => {
    token = jwt.sign(
      { id: REAL_USER_ID, email: 'daniel.aguirre7478@alumnos.udg.mx' },
      process.env.JWT_SECRET || 'cucei_conectado_clave_secreta_desarrollo_2026',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Limpieza en la BD usando la columna correcta 'id_posts_comments'
    if (createdPostId) {
      await pool.query('DELETE FROM posts_comments WHERE id_posts_comments = $1', [createdPostId]);
    }

    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  });

  test('Debe procesar la publicación enviando la petición a la IA y guardando en BD', async () => {
    const res = await request(app)
      .post('/api/posts/create')
      .set('Authorization', `Bearer ${token}`)
      .send({
        content_post: 'Hola a todos buenos dias',
        id_user: REAL_USER_ID,
        id_group: REAL_GROUP_ID
      });

    // 1. Validar respuesta HTTP 201 y la propiedad 'post'
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('post');
    expect(res.body.post).toHaveProperty('id_posts_comments');

    createdPostId = res.body.post.id_posts_comments;

    // 2. Validar almacenamiento real en PostgreSQL
    const dbQuery = await pool.query(
      'SELECT * FROM posts_comments WHERE id_posts_comments = $1',
      [createdPostId]
    );
    expect(dbQuery.rows.length).toBe(1);
    expect(dbQuery.rows[0].content_posts_comments).toContain('buenos dias');
  });
});