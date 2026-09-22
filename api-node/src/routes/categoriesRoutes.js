const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/getAll', async (req, res) => {
    try {
        const query = 'SELECT id_categories, name_categories FROM public.categories ORDER BY id_categories ASC;';
        const result = await pool.query(query);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("Error al obtener categorías:", err.message);
        res.status(500).json({ error: "Error al obtener categorías" });
    }
});
module.exports = router;