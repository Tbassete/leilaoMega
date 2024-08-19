const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Conectando ao MongoDB
mongoose.connect('mongodb://localhost/leilao', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Conectado ao MongoDB'))
    .catch((err) => console.error('Erro ao conectar ao MongoDB', err));

// Definindo o esquema do leilão
const leilaoSchema = new mongoose.Schema({
    item: String,
    lanceMinimo: Number,
    lanceAtual: Number,
    ultimoLicitante: String,
    dataFinal: Date
});

const Leilao = mongoose.model('Leilao', leilaoSchema);

// Middleware para servir arquivos estáticos (como HTML e CSS)
app.use(express.static('public'));

// Função para verificar se o leilão já terminou
function leilaoFinalizado(leilao) {
    const agora = new Date();
    return agora >= leilao.dataFinal;
}

// Quando um cliente se conecta
io.on('connection', async (socket) => {
    console.log('Novo usuário conectado');

    // Busca o leilão no banco de dados
    let leilao = await Leilao.findOne();

    // Se não houver leilão, cria um novo
    if (!leilao) {
        leilao = new Leilao({
            item: 'Produto Exemplo',
            lanceMinimo: 100, // Lance mínimo em reais
            lanceAtual: 0,
            ultimoLicitante: null,
            dataFinal: new Date(2024, 8, 2, 23, 59, 59) // 2 de setembro de 2024, 23:59:59
        });
        await leilao.save();
    }

    // Envia o estado inicial do leilão ao usuário recém-conectado
    socket.emit('estadoAtual', leilao);

    // Lida com novos lances
    socket.on('fazerLance', async (lance) => {
        if (leilaoFinalizado(leilao)) {
            socket.emit('leilaoEncerrado', {
                mensagem: 'O leilão já foi encerrado. Não são permitidos novos lances.'
            });
            return;
        }

        if (lance.valor >= leilao.lanceMinimo && lance.valor > leilao.lanceAtual) {
            leilao.lanceAtual = lance.valor;
            leilao.ultimoLicitante = lance.usuario;

            // Salva o leilão atualizado no banco de dados
            await leilao.save();

            // Notifica todos os usuários sobre o novo lance
            io.emit('novoLance', leilao);
        } else {
            // Se o lance for inválido, notifica apenas o licitante
            socket.emit('lanceInvalido', {
                mensagem: 'Lance inválido. O lance deve ser maior que o lance atual e o lance mínimo.'
            });
        }
    });

    // Quando um usuário se desconecta
    socket.on('disconnect', () => {
        console.log('Usuário desconectado');
    });
});

// Inicia o servidor
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
