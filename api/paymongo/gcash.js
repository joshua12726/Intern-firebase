const { admin, paymongoRequest, requireFirebaseUser, setCors } = require('../_lib/paymongo');

const catalog = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1 };

module.exports = async function handler(request, response) {
	setCors(response);
	if (request.method === 'OPTIONS') return response.status(204).end();
	if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
	try {
		const user = await requireFirebaseUser(request);
		const inputItems = Array.isArray(request.body?.items) ? request.body.items : [];
		const items = inputItems.map((item) => {
			const id = Number(item.id);
			const quantity = Math.max(1, Math.min(99, Number(item.qty) || 1));
			if (!catalog[id]) throw new Error('The cart contains an invalid product.');
			return { id, quantity, unitPrice: catalog[id] };
		});
		if (!items.length) return response.status(400).json({ error: 'Your cart is empty.' });
		const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
		const order = await admin.firestore().collection('orders').add({ userId: user.uid, userEmail: user.email || null, items, total, currency: 'PHP', paymentMethod: 'gcash', status: 'pending_payment', createdAt: admin.firestore.FieldValue.serverTimestamp() });
		const origin = process.env.APP_URL || 'http://localhost:3000';
		const source = await paymongoRequest('/v1/sources', {
			method: 'POST',
			body: JSON.stringify({ data: { attributes: { amount: Math.round(total * 100), currency: 'PHP', type: 'gcash', redirect: { success: `${origin}/checkout.html?payment=success&order_id=${order.id}`, failed: `${origin}/checkout.html?payment=failed&order_id=${order.id}` } } } })
		});
		await order.update({ paymongoSourceId: source.data.id });
		return response.json({ checkoutUrl: source.data.attributes.redirect.checkout_url, orderId: order.id });
	} catch (error) {
		return response.status(400).json({ error: error.message || 'Unable to start GCash payment.' });
	}
};