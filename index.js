import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

// TOKEN DE PRODUCCIÓN REAL
const CONTIFICO_TOKEN = "59882a8b-188b-42f5-bb8f-c61a6ef66e34";
const CONTIFICO_API = "https://api.contifico.com/sistema/api/v1";

app.get('/', async (req, res) => {
  try {
    const response = await axios.get(`${CONTIFICO_API}/clientes/`, {
      headers: {
        Authorization: `Token ${CONTIFICO_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log("✅ Token válido. Clientes recuperados:");
    console.log(response.data);
    res.status(200).send({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ Error al validar token con /clientes/:", error.response?.data || error.message);
    res.status(500).send({ error: error.response?.data || error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor de prueba escuchando en el puerto ${PORT}`);
});
