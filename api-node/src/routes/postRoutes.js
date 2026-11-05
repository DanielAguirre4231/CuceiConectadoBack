const express = require('express');
const router = express.Router();
const pool = require('../db');
const upload = require('../middlewares/upload');
const axios = require('axios');
const verifyToken = require('../middlewares/auth');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000/predict';

async function moderateContent(text) {
  if (!text || !text.trim()) {
    return { success: true, is_offensive: false, sentiment_score: 1.0, requires_review: false };
  }

  try {
    const response = await axios.post(AI_SERVICE_URL, { text }, { timeout: 3000 });

    if (!response.data) {
      throw new Error("Respuesta vacía del servidor de IA.");
    }

    return {
      success: true,
      is_offensive: Boolean(response.data.is_offensive),
      sentiment_score: typeof response.data.sentiment_score === 'number' ? response.data.sentiment_score : 1.0,
      requires_review: false
    };
  } catch (error) {
    const detail = error.response?.data?.detail || error.message;
    console.error('Error al conectar con el microservicio de IA:', detail);

    return {
      success: false,
      is_offensive: false,
      sentiment_score: 0.5,
      requires_review: true
    };
  }
}

// POST /api/posts

//INSERT POSTS//
router.post('/create', verifyToken, upload.single('image'), async (req, res) => {
  try {
    const { id_user, id_group, content_post, parent_id } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    let aiResult = { sentiment_score: 1.0, is_offensive: false };

    // Evaluar contenido con el microservicio de IA
    if (content_post && content_post.trim() !== '') {
      aiResult = await moderateContent(content_post);
    }

    const UMBRAL_MINIMO = 0.4;
    if (aiResult.is_offensive || aiResult.sentiment_score < UMBRAL_MINIMO) {
      return res.status(400).json({
        error: "Tu comentario infringe las normas de la comunidad y ha sido bloqueado",
        score: aiResult.sentiment_score
      });
    }

    const query = `
      WITH inserted_post AS (
        INSERT INTO posts_comments (
          content_posts_comments,
          id_users_posts_comments,
          id_groups_posts_comments,
          parent_id_posts_comments,
          image_url_post,
          ai_sentiment_score,
          is_offensive
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      )
      SELECT 
        ip.*,
        CONCAT(u.FIRST_NAME_USERS, ' ', u.LAST_NAME_USERS) AS user_full_name
      FROM inserted_post ip
      LEFT JOIN public.USERS u ON ip.id_users_posts_comments = u.id_users;
    `;

    const values = [
      content_post || null,
      (id_user && id_user !== 'undefined') ? id_user : null,
      (id_group && id_group !== 'undefined') ? id_group : null,
      (parent_id && parent_id !== 'undefined') ? parent_id : null, 
      image_url,
      aiResult.sentiment_score, 
      aiResult.is_offensive     
    ];

    const newPost = await pool.query(query, values);

    res.status(201).json({
      message: "Publicación creada con éxito",
      post: newPost.rows[0] 
    });

  } catch (err) {
    console.error("Error al insertar post:", err.message);
    res.status(500).json({ error: err.message });
  }
});

//GET ALL POSTS//
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        pc.id_posts_comments,
        pc.content_posts_comments,
        pc.image_url_post,
        pc.parent_id_posts_comments,
        pc.ai_sentiment_score,
        pc.is_offensive,
        pc.created_at,
        u.id_users,
        u.first_name_users || ' ' || u.last_name_users || ' ' || u.last_name_m_users AS user_full_name,
        g.id_groups,
        g.name_groups
      FROM posts_comments pc
      LEFT JOIN users u ON pc.id_users_posts_comments = u.id_users
      LEFT JOIN groups g ON pc.id_groups_posts_comments = g.id_groups
      ORDER BY pc.created_at DESC;
    `;

    const result = await pool.query(query);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      posts: result.rows
    });

  } catch (err) {
    console.error("Error al obtener publicaciones:", err.message);
    res.status(500).json({ 
      error: "Error interno al obtener publicaciones", 
      detalle: err.message 
    });
  }
});

//UPDATE//
router.put('/edit/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content_posts_comments } = req.body;

    if (!content_posts_comments || !content_posts_comments.trim()) {
      return res.status(400).json({ error: "El contenido de la publicación no puede estar vacío." });
    }

    // Moderar nuevo contenido antes de actualizar
    const aiResult = await moderateContent(content_posts_comments);

    const UMBRAL_MINIMO = 0.4;
    if (aiResult.is_offensive || aiResult.sentiment_score < UMBRAL_MINIMO) {
      return res.status(400).json({
        error: "La edición infringe las normas de la comunidad y ha sido bloqueada",
        score: aiResult.sentiment_score
      });
    }

    const query = `
      UPDATE posts_comments
      SET content_posts_comments = $1,
          ai_sentiment_score = $2,
          is_offensive = $3
      WHERE id_posts_comments = $4
      RETURNING *;
    `;
    
    const values = [content_posts_comments.trim(), aiResult.sentiment_score, aiResult.is_offensive, id];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Publicación no encontrada." });
    }

    res.status(200).json({
      message: "Publicación actualizada con éxito",
      post: result.rows[0]
    });

  } catch (err) {
    console.error("Error al actualizar la publicación:", err.message);
    res.status(500).json({ 
      error: "Error interno al actualizar la publicación", 
      detalle: err.message 
    });
  }
});

// DELETE BY ID//
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      DELETE FROM posts_comments
      WHERE id_posts_comments = $1
      RETURNING *;
    `;
    
    const values = [id];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Publicación no encontrada." });
    }

    res.status(200).json({
      message: "Publicación eliminada permanentemente",
      deletedPost: result.rows[0]
    });

  } catch (err) {
    console.error("Error al eliminar la publicación:", err.message);
    res.status(500).json({ 
      error: "Error interno al eliminar la publicación", 
      detalle: err.message 
    });
  }
});

//GET BY ID//
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        pc.id_posts_comments,
        pc.content_posts_comments,
        pc.image_url_post,
        pc.parent_id_posts_comments,
        pc.ai_sentiment_score,
        pc.is_offensive,
        pc.created_at,
        u.id_users,
        u.first_name_users || ' ' || u.last_name_users || ' ' || u.last_name_m_users AS user_full_name,
        g.id_groups,
        g.name_groups
      FROM posts_comments pc
      LEFT JOIN users u ON pc.id_users_posts_comments = u.id_users
      LEFT JOIN groups g ON pc.id_groups_posts_comments = g.id_groups
      WHERE pc.id_posts_comments = $1;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Publicación no encontrada." });
    }

    res.status(200).json({
      success: true,
      post: result.rows[0]
    });

  } catch (err) {
    console.error("Error al obtener la publicación:", err.message);
    res.status(500).json({ 
      error: "Error interno al obtener la publicación", 
      detalle: err.message 
    });
  }
});

//GET BY GROUP//
router.get('/group/:id_group', async (req, res) => {
  try {
    const { id_group } = req.params;

    const query = `
      SELECT 
        pc.id_posts_comments,
        pc.content_posts_comments,
        pc.image_url_post,
        pc.parent_id_posts_comments,
        pc.ai_sentiment_score,
        pc.is_offensive,
        pc.created_at,
        u.id_users,
        u.first_name_users || ' ' || u.last_name_users || ' ' || u.last_name_m_users AS user_full_name,
        g.id_groups,
        g.name_groups
      FROM posts_comments pc
      LEFT JOIN users u ON pc.id_users_posts_comments = u.id_users
      LEFT JOIN groups g ON pc.id_groups_posts_comments = g.id_groups
      WHERE pc.id_groups_posts_comments = $1 
      ORDER BY pc.created_at DESC;
    `;

    const result = await pool.query(query, [id_group]);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      posts: result.rows
    });

  } catch (err) {
    console.error("Error al obtener publicaciones del grupo:", err.message);
    res.status(500).json({ 
      error: "Error interno al obtener publicaciones del grupo", 
      detalle: err.message 
    });
  }
});

//GET THREAD//
router.get('/comments/:id_post', async (req, res) => {
  try {
    const { id_post } = req.params;

    const query = `
      SELECT P.*, U.FIRST_NAME_USERS, U.LAST_NAME_USERS 
      FROM public.posts_comments P
      LEFT JOIN public.USERS U ON P.ID_USERS_POSTS_COMMENTS = U.ID_USERS
      WHERE P.ID_GROUPS_POSTS_COMMENTS = $1 
      ORDER BY P.CREATED_AT DESC;
    `;

    const result = await pool.query(query, [id_post]);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      comments: result.rows
    });

  } catch (err) {
    console.error("Error al obtener comentarios:", err.message);
    res.status(500).json({ 
      error: "Error interno al obtener comentarios", 
      detalle: err.message 
    });
  }
});

//AUTHED UPDATE//

router.put('/update/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { content_post } = req.body;

  const userId = req.user?.id || req.user?.id_users || req.user?.userId;

  if (!content_post || !content_post.trim()) {
    return res.status(400).json({ error: "El contenido no puede estar vacío" });
  }

  if (!id || id === 'undefined' || id === 'null') {
    return res.status(400).json({ error: "ID de publicación o comentario no válido" });
  }

  try {
    const cleanId = String(id).trim();

    // 1. Obtener el autor
    const postCheck = await pool.query(
      'SELECT id_users_posts_comments FROM public.posts_comments WHERE id_posts_comments::text = $1',
      [cleanId]
    );

    if (postCheck.rows.length === 0) {
      return res.status(404).json({ error: "Publicación o comentario no encontrado" });
    }

    const authorId = postCheck.rows[0].id_users_posts_comments;

    // 2. Verificar propiedad de la publicación
    if (userId && authorId && String(authorId).trim() !== String(userId).trim()) {
      return res.status(403).json({ error: "Acceso denegado. Solo puedes editar tus propios elementos." });
    }

    // 3. Moderar el nuevo contenido con la IA
    const aiResult = await moderateContent(content_post);

    const UMBRAL_MINIMO = 0.4;
    if (aiResult.is_offensive || aiResult.sentiment_score < UMBRAL_MINIMO) {
      return res.status(400).json({
        error: "La edición infringe las normas de la comunidad y ha sido bloqueada",
        score: aiResult.sentiment_score
      });
    }

    // 4. Actualizar contenido y los valores calculados por la IA
    const updateQuery = `
      UPDATE public.posts_comments 
      SET content_posts_comments = $1,
          ai_sentiment_score = $2,
          is_offensive = $3
      WHERE id_posts_comments::text = $4 
      RETURNING *;
    `;
    const result = await pool.query(updateQuery, [
      content_post.trim(),
      aiResult.sentiment_score,
      aiResult.is_offensive,
      cleanId
    ]);

    res.json({
      message: "Actualizado correctamente",
      post: result.rows[0]
    });

  } catch (err) {
    console.error("🔴 ERROR EN PUT /posts/update:", err);
    res.status(500).json({ 
      error: "Error interno al actualizar en la base de datos", 
      message: err.message 
    });
  }
});

module.exports = router;