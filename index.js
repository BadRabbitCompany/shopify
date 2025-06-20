import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

// Token real de producción
const CONTIFICO_TOKEN = "59882a8b-188b-42f5-bb8f-c61a6ef66e34";
const CONTIFICO_API = 'https://api.contifico.com/sistema/api/v1';

app.get('/', (req, res) => {
  res.send('✅ Webhook conectado a PRODUCCIÓN. Esperando órdenes de Shopify...');
});

app.post('/webhook', async (req, res) => {
  const order = req.body;
  console.log("📦 Pedido recibido de Shopify:");
  console.log(JSON.stringify(order, null, 2));

  if (!order.line_items || !order.line_items.length) {
    console.error("❌ Pedido sin productos");
    return res.status(400).send({ error: "Pedido sin productos" });
  }

  const venta = {
    cliente: order.customer?.email || '9999999999',  // asegurarse que exista ese cliente
    observaciones: `Orden Shopify #${order.name}`,
    tipo_comprobante: 'NOTA DE VENTA',
    fecha_emision: new Date().toISOString().split('T')[0],
    almacen: '1',  // debe ser el ID real de la bodega principal
    detalles: order.line_items.map(item => ({
      codigo_principal: item.sku || item.product_id.toString(),
      cantidad: item.quantity,
      precio_unitario: parseFloat(item.price),
      descuento: 0
    })),
    forma_pago: "EFECTIVO",
    plazo: 0
  };

  try {
    const response = await axios.post(`${CONTIFICO_API}/ventas/`, venta, {
      headers: {
        Authorization: `Token ${CONTIFICO_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Venta registrada en Contífico:', response.data);
    res.status(200).send({ success: true });
  } catch (error) {
    console.error('❌ Error al enviar venta a Contífico:', error.response?.data || error.message);
    res.status(500).send({ error: 'Error al enviar venta a Contífico' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});