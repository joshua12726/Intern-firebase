const crypto = require('crypto');
const admin = require('firebase-admin');

function initialiseFirebase() {
	if (admin.apps.length) return;
	const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
	if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccount)) });
	else admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

async function requireFirebaseUser(request) {
	initialiseFirebase();
	const token = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');
	if (!token) throw new Error('Sign in before paying.');
	return admin.auth().verifyIdToken(token);
}

async function paymongoRequest(pathname, options) {
	const key = process.env.PAYMONGO_SECRET_KEY;
	if (!key) throw new Error('PAYMONGO_SECRET_KEY is not configured.');
	const result = await fetch('https://api.paymongo.com' + pathname, {
		...options,
		headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64'), ...(options.headers || {}) }
	});
	const body = await result.json();
	if (!result.ok) throw new Error(body.errors?.[0]?.detail || 'PayMongo request failed.');
	return body;
}

function setCors(response) {
	response.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
	response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function verifyWebhookSignature(payload, signature, livemode) {
	const parts = Object.fromEntries(signature.split(',').map((part) => part.split('=')));
	const expected = crypto.createHmac('sha256', process.env.PAYMONGO_WEBHOOK_SECRET || '').update(`${parts.t}.${payload}`).digest('hex');
	const received = livemode ? parts.li : parts.te;
	return Boolean(parts.t && received && received.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received)));
}

module.exports = { admin, initialiseFirebase, requireFirebaseUser, paymongoRequest, setCors, verifyWebhookSignature };