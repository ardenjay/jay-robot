require('dotenv').config();
const express = require('express');
const path = require('path');

const uploadRouter = require('./routes/upload');
const chatRouter = require('./routes/chat');
const projectsRouter = require('./routes/projects');
const configRouter = require('./routes/config');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

app.use('/api/upload', uploadRouter);
app.use('/api/chat', chatRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/config', configRouter);

app.listen(PORT, () => {
  console.log(`Jay Robot running at http://localhost:${PORT}`);
});

module.exports = app;
