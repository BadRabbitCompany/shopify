import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

// CREDENCIALES DE CONTIFICO PROPORCIONADAS
const CONTIFICO_API_KEY = "FrguR1kDpFHaXHLQwplZ2CwTX3p8p9XHVTnukL98V5U";
const CONTIFICO_TOKEN = "dce704ae-189e-4545-bea3-257d9249a594";
const CONTIFICO_API = "https://base.contifico.com/sistema/api/v1";

// Webhook URL for reference
const WEBHOOK_URL = "https://shopify-pwqd.onrender.com/webhook";

// Verificar webhook de Shopify (simplificado sin HMAC)
function verifyShopifyWebhook(req, res, next) {
  const topicHeader = req.get('X-Shopify-Topic');
  const shopHeader = req.get('X-Shopify-Shop-Domain');

  if (!topicHeader || !shopHeader) {
    console.log('❌ Headers de Shopify faltantes');
    return res.status(401).send('Unauthorized');
  }

  // Verificar que sea un webhook de órdenes
  if (topicHeader !== 'orders/create' && topicHeader !== 'orders/updated') {
    console.log('❌ Webhook topic no válido:', topicHeader);
    return res.status(400).send('Invalid webhook topic');
  }

  console.log('✅ Webhook recibido de:', shopHeader, 'Topic:', topicHeader);
  next();
}

// Generador de número de documento simulado
function generateDocNumber(order) {
  const base = "001-001-";
  const padded = order.id.toString().padStart(9, "0");
  return base + padded;
}

// Formatear fecha para Contifico (YYYY-MM-DD)
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toISOString().split('T')[0];
}

app.get('/', (req, res) => {
  res.send('✅ Webhook conectado. Esperando órdenes de Shopify...');
});

app.post('/webhook', verifyShopifyWebhook, async (req, res) => {
  try {
    const order = req.body;
    console.log("📦 Pedido recibido de Shopify:");
    console.log(`ID: ${order.id}, Total: ${order.total_price}, Estado: ${order.financial_status}`);

    // Validar datos requeridos
    if (!order.id || !order.line_items || !order.line_items.length) {
      console.log('❌ Datos de orden incompletos');
      return res.status(400).send({ error: 'Datos de orden incompletos' });
    }

    // Mapear datos de Shopify a Contifico
    const ventaDoc = {
      pos: CONTIFICO_TOKEN,
      fecha_emision: formatDate(order.created_at),
      tipo_documento: "FAC",
      documento: generateDocNumber(order),
      estado: "P",
      electronico: false,
      autorizacion: "",
      cliente: {
        cedula: order.customer?.id?.toString() || "9999999999",
        razon_social: `${order.customer?.first_name || "Cliente"} ${order.customer?.last_name || "Shopify"}`,
        email: order.customer?.email || "noemail@example.com",
        direccion: order.billing_address?.address1 || "",
        telefono: order.billing_address?.phone || ""
      },
      detalles: order.line_items.map(item => {
        const precio = parseFloat(item.price);
        const cantidad = parseInt(item.quantity);
        const baseGravable = precio * cantidad;
        
        return {
          producto_id: item.sku || item.product_id.toString(),
          cantidad: cantidad,
          precio: precio,
          porcentaje_iva: 12,
          porcentaje_descuento: 0,
          base_gravable: baseGravable
        };
      }),
      cobros: [{
        forma_cobro: "EFECTIVO",
        monto: parseFloat(order.total_price),
        numero_cheque: "",
        tipo_ping: ""
      }]
    };

    console.log('📋 Documento a enviar a Contifico:');
    console.log(JSON.stringify(ventaDoc, null, 2));

    const response = await axios.post(`${CONTIFICO_API}/documento/`, ventaDoc, {
      headers: {
        'Authorization': `ApiKey ${CONTIFICO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 segundos timeout
    });

    console.log('✅ Documento registrado en Contifico:', response.data);
    res.status(200).send({ 
      success: true, 
      contifico_id: response.data.id,
      shopify_order_id: order.id 
    });

  } catch (error) {
    console.error("❌ Error al procesar webhook:");
    
    if (error.response) {
      console.error("Error de Contifico:", error.response.status, error.response.data);
      res.status(500).send({ 
        error: 'Error de Contifico', 
        details: error.response.data,
        shopify_order_id: req.body.id 
      });
    } else if (error.request) {
      console.error("Error de red:", error.message);
      res.status(500).send({ 
        error: 'Error de conexión con Contifico',
        shopify_order_id: req.body.id 
      });
    } else {
      console.error("Error interno:", error.message);
      res.status(500).send({ 
        error: 'Error interno del servidor',
        shopify_order_id: req.body.id 
      });
    }
  }
});

// Endpoint de prueba para verificar conexión con Contifico
app.get('/test-contifico', async (req, res) => {
  try {
    const response = await axios.get(`${CONTIFICO_API}/empresa/`, {
      headers: {
        'Authorization': `ApiKey ${CONTIFICO_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    res.json({ success: true, empresa: response.data });
  } catch (error) {
    res.status(500).json({ 
      error: 'Error conectando con Contifico', 
      details: error.response?.data || error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
  console.log(`📝 Webhook URL: ${WEBHOOK_URL}`);
  console.log(`🧪 Test URL: http://localhost:${PORT}/test-contifico`);
  console.log(`🔗 Tu webhook está configurado en Shopify para: ${WEBHOOK_URL}`);
  console.log(`⚠️  HMAC verification deshabilitado para simplificar la integración`);
});