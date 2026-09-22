const express = require('express');
const router = express.Router();
const pool = require('../db');
const upload = require('../middlewares/upload');
const axios = require('axios');

// POST /api/posts

//INSERT POSTS//
router.post('/create', upload.single('image'), async (req, res) => {
  try {

    const { id_user, id_group, content_post, parent_id } = req.body;

    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    let aiResult = { sentiment_score: 1.0, is_offensive: false }; 

    if (content_post && content_post.trim() !== '') {
      try {
        const aiResponse = await axios.post('http://localhost:8000/predict', {
          content: content_post
        });
        aiResult = aiResponse.data; 
      } catch (aiError) {
        console.error("Error al conectar con el microservicio de IA:", aiError.message);
      }
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
        -- Datos del grupo al que pertenece la publicación
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

    // Validación básica
    if (!content_posts_comments) {
      return res.status(400).json({ error: "El contenido de la publicación no puede estar vacío." });
    }

    const query = `
      UPDATE posts_comments
      SET content_posts_comments = $1
      WHERE id_posts_comments = $2
      RETURNING *;
    `;
    
    const values = [content_posts_comments, id];
    const result = await pool.query(query, values);

    // Si no se devolvió ningún registro, el ID no existe
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

    // Si el arreglo rows está vacío, significa que el post no existía
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

module.exports = router;