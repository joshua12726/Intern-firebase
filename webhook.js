const { admin, initialiseFirebase, verifyWebhookSignature } = require('../_lib/paymongo');

module.exports = async function handler(request, response) {
	if (request.method !== 'POST') return response.status(405).end();
	const chunks = [];
	for await (const chunk of request) chunks.push(chunk);
	const payload = Buffer.concat(chunks).toString();
	try {
		const event = JSON.parse(payload);
		if (!verifyWebhookSignature(payload, request.headers['paymongo-signature'] || '', event.data?.attributes?.livemode)) return response.status(400).end();
		const sourceId = event.data?.attributes?.data?.id || event.data?.attributes?.source?.id;
		if (sourceId && event.data?.attributes?.type === 'source.chargeable') {
			initialiseFirebase();
			const snapshot = await admin.firestore().collection('orders').where('paymongoSourceId', '==', sourceId).limit(1).get();
			if (!snapshot.empty) await snapshot.docs[0].ref.update({ status: 'paid', paidAt: admin.firestore.FieldValue.serverTimestamp() });
		}
		return response.status(200).end();
	} catch (error) {
		return response.status(400).end();
	}
};

module.exports.config = { api: { bodyParser: false } };