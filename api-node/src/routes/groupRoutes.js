const express = require('express');
const router = express.Router();
const pool = require('../db');


// ROUTE: /api/groups //

//INSERT GROUP
router.post('/insertGroup', async (req, res) => {
    const { name, description, category_id, creator_id, is_private } = req.body;

    if (!name || !category_id || !creator_id) {
        return res.status(400).json({ error: "Nombre, categoría y creador son obligatorios" });
    }

    try {
        const query = `
            INSERT INTO public.groups (name_groups, desc_groups, id_categories_groups, creator_id_groups, is_private)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        const result = await pool.query(query, [name, description, category_id, creator_id, is_private || false]);
        const newGroup = result.rows[0];

        // Registrar al creador automáticamente como miembro
        await pool.query(
            'INSERT INTO public.user_groups (id_user, id_group) VALUES ($1, $2)',
            [creator_id, newGroup.id_groups]
        );

        res.status(201).json({
            message: "Grupo creado exitosamente",
            group: newGroup
        });
    } catch (err) {
        console.error("Error en /insertGroup:", err.message);
        res.status(500).json({ error: "Error al crear el grupo" });
    }
});

//JOIN GROUP
router.post('/joinGroup', async (req, res) => {
    const { user_id, group_id } = req.body;

    try {
        const groupRes = await pool.query('SELECT is_private FROM public.groups WHERE id_groups = $1', [group_id]);
        if (groupRes.rows.length === 0) return res.status(404).json({ error: "Grupo no encontrado" });

        const isPrivate = groupRes.rows[0].is_private;

        if (isPrivate) {
            // Verificar si ya envió una solicitud previamente
            const checkReq = await pool.query(
                'SELECT * FROM public.group_requests WHERE id_group = $1 AND id_user = $2',
                [group_id, user_id]
            );

            if (checkReq.rows.length > 0) {
                return res.status(400).json({ error: "Ya tienes una solicitud pendiente para este grupo." });
            }

            // Crear registro en la tabla group_requests
            await pool.query(
                'INSERT INTO public.group_requests (id_group, id_user) VALUES ($1, $2)',
                [group_id, user_id]
            );

            return res.json({ status: 'PENDING', message: "Solicitud enviada al creador del grupo." });
        } else {
            // Grupo público: registro directo
            await pool.query(
                'INSERT INTO public.user_groups (id_user, id_group) VALUES ($1, $2)',
                [user_id, group_id]
            );
            return res.json({ status: 'JOINED', message: "¡Te has unido al grupo exitosamente!" });
        }
    } catch (err) {
        console.error("Error en /joinGroup:", err.message);
        if (err.code === '23505') { 
            return res.status(400).json({ error: "Ya eres miembro de este grupo" });
        }
        res.status(500).json({ error: "Error interno al procesar la solicitud" });
    }
});

//GET ALL GROUPS
router.get('/getAllGroups', async (req, res) => {
    try {
        const query = `
            SELECT G.*, C.NAME_CATEGORIES 
            FROM public.GROUPS G
            LEFT JOIN public.CATEGORIES C ON G.ID_CATEGORIES_GROUPS = C.ID_CATEGORIES
            ORDER BY G.CREATED_AT DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "ERROR /getAllGroups" });
    }
});

//GET ONE GROUP BY ID
router.get('/getOneGroupById/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT G.*, C.NAME_CATEGORIES 
            FROM public.GROUPS G
            LEFT JOIN public.CATEGORIES C ON G.ID_CATEGORIES_GROUPS = C.ID_CATEGORIES
            WHERE G.ID_GROUPS = $1
        `;
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Grupo no encontrado" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        if (err.code === '22P02') {
            return res.status(400).json({ error: "Invalid Group ID" });
        }
        res.status(500).json({ error: "ERROR /getOneGroupById" });
    }
});

//UPDATE GROUP
router.put('/updateGroup/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, category_id } = req.body;

    try {
        const query = `
            UPDATE public.GROUPS 
            SET 
                NAME_GROUPS          = COALESCE($1, NAME_GROUPS),
                DESC_GROUPS          = COALESCE($2, DESC_GROUPS),
                ID_CATEGORIES_GROUPS = COALESCE($3, ID_CATEGORIES_GROUPS)
            WHERE ID_GROUPS = $4
            RETURNING *;
        `;
        const result = await pool.query(query, [
            name || null, 
            description || null, 
            category_id ? parseInt(category_id, 10) : null, 
            id
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Grupo no encontrado" });
        }

        res.json({
            message: "Grupo actualizado correctamente",
            group: result.rows[0]
        });
    } catch (err) {
        console.error("Error en /updateGroup:", err.message);
        res.status(500).json({ error: "ERROR /updateGroup", message: err.message });
    }
});

//DELETE GROUP
router.delete('/deleteGroup/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Eliminar publicaciones y comentarios vinculados
        await pool.query('DELETE FROM public.posts_comments WHERE id_groups_posts_comments = $1', [id]);

        // 2. Eliminar inscripciones de miembros
        await pool.query('DELETE FROM public.user_groups WHERE id_group = $1', [id]);

        // 3. Eliminar el grupo
        const query = 'DELETE FROM public.GROUPS WHERE ID_GROUPS = $1 RETURNING *;';
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Grupo no encontrado o ya fue eliminado" });
        }

        res.json({ 
            message: "Grupo eliminado con éxito",
            deletedGroup: result.rows[0]
        });

    } catch (err) {
        console.error("Error en /deleteGroup:", err.message);
        res.status(500).json({ error: "ERROR /deleteGroup", message: err.message });
    }
});

//GET GROUPS BY USER
router.get('/getGroupsByUser/:user', async (req, res) => {
    const { user } = req.params;
    try {
        const query = `
            SELECT G.*, C.NAME_CATEGORIES, UG.JOINED_AT 
            FROM public.USER_GROUPS UG
            JOIN public.GROUPS G ON UG.ID_GROUP = G.ID_GROUPS
            LEFT JOIN public.CATEGORIES C ON G.ID_CATEGORIES_GROUPS = C.ID_CATEGORIES
            WHERE UG.ID_USER = $1
            ORDER BY UG.JOINED_AT DESC; 
        `;
        const result = await pool.query(query, [user]);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "ERROR /getGroupsByUser" });
    }
});

//LEAVE GROUP
router.delete('/leaveGroup', async (req, res) => {
    try {
        const { user_id, group_id } = req.body;

        if (!user_id || !group_id) {
            return res.status(400).json({ error: "Se requiere id_user e id_group" });
        }

        const query = `
            DELETE FROM public.user_groups 
            WHERE id_user = $1 AND id_group = $2 
            RETURNING *;
        `;
        const result = await pool.query(query, [user_id, group_id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "No se encontró la inscripción a este grupo" });
        }

        res.status(200).json({ message: "Has abandonado el grupo exitosamente" });
    } catch (err) {
        console.error("Error al abandonar el grupo:", err);
        res.status(500).json({ error: "Error en el servidor al abandonar el grupo" });
    }
});

// Obtener solicitudes pendientes del grupo
router.get('/requests/:groupId', async (req, res) => {
    const { groupId } = req.params;
    try {
        const query = `
            SELECT gr.*, u.first_name_users, u.last_name_users, u.email_users, u.major_users
            FROM public.group_requests gr
            JOIN public.users u ON gr.id_user = u.id_users
            WHERE gr.id_group = $1 AND gr.status = 'PENDING'
            ORDER BY gr.created_at DESC;
        `;
        const result = await pool.query(query, [groupId]);
        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener solicitudes:", err.message);
        res.status(500).json({ error: "Error al obtener solicitudes" });
    }
});

// Aceptar o rechazar solicitud
router.post('/respondRequest', async (req, res) => {
    const { requestId, status, group_id, user_id } = req.body; // status: 'ACCEPTED' o 'REJECTED'

    try {
        if (status === 'ACCEPTED') {
            await pool.query(
                'INSERT INTO public.user_groups (id_user, id_group) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [user_id, group_id]
            );
        }

        await pool.query('DELETE FROM public.group_requests WHERE id_request = $1', [requestId]);

        res.json({ message: status === 'ACCEPTED' ? 'Usuario aceptado' : 'Solicitud rechazada' });
    } catch (err) {
        console.error("Error en /respondRequest:", err.message);
        res.status(500).json({ error: "Error al procesar la respuesta" });
    }
});

module.exports = router;