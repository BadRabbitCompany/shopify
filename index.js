import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

// Credenciales de prueba (demo)
const CONTIFICO_TOKEN = "bd982a65-3807-4e73-b7bc-b42f621721c9";
const CONTIFICO_API = "https://api.contifico.com/sistema/api/v1/documento/";

// Generador de número de documento simulado
function generateDocNumber(order) {
  const base = "001-001-";
  const padded = order.id.toString().padStart(9, "0");
  return base + padded;
}

app.get('/', (req, res) => {
  res.send('✅ Webhook conectado (modo documento demo)');
});

app.post('/webhook', async (req, res) => {
  const order = req.body;
  console.log("📦 Pedido recibido:");
  console.log(JSON.stringify(order, null, 2));

  const ventaDoc = {
    pos: CONTIFICO_TOKEN,
    fecha_emision: new Date().toLocaleDateString("es-EC"), // DD/MM/YYYY
    tipo_documento: "FAC", // Puede ser "NV" si es nota de venta
    documento: generateDocNumber(order),
    estado: "P",
    electronico: false,
    autorizacion: "",
    cliente: {
      cedula: order.customer?.id?.toString() || "9999999999",
      razon_social: `${order.customer?.first_name || "Cliente"} ${order.customer?.last_name || "Shopify"}`,
      email: order.customer?.email || "noemail@example.com"
    },
    detalles: order.line_items.map(item => ({
      producto_id: item.sku || item.product_id.toString(),
      cantidad: item.quantity,
      precio: parseFloat(item.price),
      porcentaje_iva: 12,
      porcentaje_descuento: 0,
      base_gravable: parseFloat(item.price) * item.quantity
    })),
    cobros: [{
      forma_cobro: "EFECTIVO",
      monto: parseFloat(order.total_price),
      numero_cheque: "",
      tipo_ping: ""
    }]
  };

  try {
    const response = await axios.post(`${CONTIFICO_API}/documento/`, ventaDoc, {
      headers: {
        Authorization: `Token ${CONTIFICO_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Documento registrado:', response.data);
    res.status(200).send({ success: true });
  } catch (error) {
    console.error('❌ Error al enviar documento:', error.response?.data || error.message);
    res.status(500).send({ error: 'Error al enviar documento a Contifico' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});
