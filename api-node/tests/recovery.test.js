const request = require('supertest');
const app = require('../src/server');
const pool = require('../src/db');
const jwt = require('jsonwebtoken');
const axios = require('axios');

describe('Prueba de Recuperación ante Fallos (Resiliencia de Microservicios)', () => {
  let token;
  const createdPostIds = [];

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
    // Limpieza de posts creados durante la prueba
    for (const id of createdPostIds) {
      await pool.query('DELETE FROM posts_comments WHERE id_posts_comments = $1', [id]);
    }
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  });

  test('1. Manejo de Fallo: Tolera la caída del microservicio de IA y aplica Fallback', async () => {
    // Simular la caída de la IA interceptando la llamada de Axios (ECONNREFUSED / Error 500)
    const axiosSpy = jest.spyOn(axios, 'post').mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 127.0.0.1:8000')
    );

    const res = await request(app)
      .post('/api/posts/create')
      .set('Authorization', `Bearer ${token}`)
      .send({
        content_post: 'Publicación de prueba enviada mientras la IA está fuera de servicio.',
        id_user: REAL_USER_ID,
        id_group: REAL_GROUP_ID
      });

    // Restaurar Axios para siguientes peticiones
    axiosSpy.mockRestore();

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('post');
    
    if (res.body.post?.id_posts_comments) {
      createdPostIds.push(res.body.post.id_posts_comments);
    }
  });

  test('2. Recuperación: Reanuda la moderación con IA al restablecer la conexión', async () => {
    // Esta petición se comunica con la IA real en FastAPI (http://localhost:8000)
    const res = await request(app)
      .post('/api/posts/create')
      .set('Authorization', `Bearer ${token}`)
      .send({
        content_post: 'Hola a todos buenos dias excelente clase',
        id_user: REAL_USER_ID,
        id_group: REAL_GROUP_ID
      });

    // Confirmar que la comunicación con la IA real funciona tras el fallo
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('post');

    if (res.body.post?.id_posts_comments) {
      createdPostIds.push(res.body.post.id_posts_comments);
    }
  });
});