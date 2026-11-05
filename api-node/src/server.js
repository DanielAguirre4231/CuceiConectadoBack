const express = require('express');
const cors = require('cors');
require('dotenv').config();
const imgPath = require('path');

const app = express(); // Única declaración limpia

app.use(cors());
app.use(express.json());

const centerRoutes = require('./routes/centerRoutes');
const userRoutes = require('./routes/userRoutes');
const groupRoutes = require('./routes/groupRoutes');
const postRoutes = require('./routes/postRoutes');
const categRoutes = require('./routes/categoriesRoutes');

//ROUTES//
app.use('/api/centers', centerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/categories', categRoutes);

//VERIFICAR LA CONEXION DE LA API//
app.get('/', (req, res) => res.send('API de QCEI Conectado funcionando'));

//RUTA DE IMAGENES (Asegúrate de que esté antes del listen)
app.use('/uploads', express.static(imgPath.join(__dirname, '../uploads')));

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor listo en http://localhost:${PORT}`);
  });
}

module.exports = app;