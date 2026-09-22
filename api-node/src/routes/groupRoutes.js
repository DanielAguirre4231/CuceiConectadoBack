const express = require('express');
const router = express.Router();
const pool = require('../db');

// ROUTE: /api/groups //

//INSERT GROUP
router.post('/insertGroup', async (req, res) => {
    const { name, description, category_id, creator_id } = req.body;

    if (!name || !category_id || !creator_id) {
        return res.status(400).json({ error: "Nombre, categoría y creador son obligatorios" });
    }

    try {
        // 1. Insertamos el grupo
        const query = `
            INSERT INTO public.GROUPS (NAME_GROUPS, DESC_GROUPS, ID_CATEGORIES_GROUPS, CREATOR_ID_GROUPS)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const result = await pool.query(query, [name, description, category_id, creator_id]);
        const newGroup = result.rows[0];

        // 2. Unimos al creador automáticamente (Lógica de membresía)
        await pool.query(
            'INSERT INTO public.USER_GROUPS (ID_USER, ID_GROUP) VALUES ($1, $2)',
            [creator_id, newGroup.id_groups]
        );

        res.status(201).json({
            message: "Grupo creado y administrador registrado correctamente",
            group: newGroup
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "ERROR /insertGroup" });
    }
});

//JOIN GROUP
router.post('/joinGroup', async (req, res) => {
    const user_id = req.body.user_id;
    const group_id = req.body.group_id;

    try {
        await pool.query(
            'INSERT INTO public.USER_GROUPS (ID_USER, ID_GROUP) VALUES ($1, $2)',
            [user_id, group_id]
        );
        res.json({ message: "Membresía aceptada. ¡Bienvenido al grupo!" });
    } catch (err) {
        console.error("Error detallado en /joinGroup:", err.message);
        if (err.code === '23505') { 
            return res.status(400).json({ error: "Ya eres miembro de este grupo" });
        }
        res.status(500).json({ error: "ERROR /joinGroup" });
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
            RETURNING *
        `;
        const result = await pool.query(query, [name, description, category_id, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Grupo no encontrado" });
        }

        res.json({
            message: "Grupo actualizado correctamente",
            group: result.rows[0]
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "ERROR /updateGroup" });
    }
});

//DELETE GROUP
router.delete('/deleteGroup/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Ejecutamos el delete
        const query = 'DELETE FROM public.GROUPS WHERE ID_GROUPS = $1 RETURNING *';
        const result = await pool.query(query, [id]);

        // Si no encontró el ID
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Grupo no encontrado o ya fue eliminado" });
        }

        res.json({ 
            message: "Grupo eliminado con éxito",
            deletedGroup: result.rows[0]
        });

    } catch (err) {
        console.error(err.message);
        
        // Error común: Intentar borrar un grupo que tiene registros asociados en USER_GROUPS o POSTS
        if (err.code === '23503') {
            return res.status(400).json({ 
                error: "No se puede eliminar el grupo porque tiene miembros o publicaciones activas.",
                detail: "Debes eliminar las dependencias primero o configurar ON DELETE CASCADE en tu DB."
            });
        }

        // Error de formato UUID
        if (err.code === '22P02') {
            return res.status(400).json({ error: "ID de grupo inválido" });
        }

        res.status(500).json({ error: "ERROR /deleteGroup" });
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

module.exports = router;