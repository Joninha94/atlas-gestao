/**
 * Verifica que a assinatura XMLDSig gerada (evento de manifestação e DPS da NFS-e) é válida:
 * assina com um certificado de teste e confere com xml-crypto, e garante que adulterar o XML invalida.
 *   node --test test/xmldsig.test.mjs   (depois de `npm run build`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { signXml, selfSignedPfx, pfxToPem } = require('../dist/integrations/xmldsig.js');
const { ManifestClient } = require('../dist/integrations/sefaz/manifest.client.js');

function verify(xml, cert) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const sigNode = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
  const sig = new SignedXml({ publicCert: cert });
  sig.loadSignature(sigNode);
  return sig.checkSignature(xml);
}

const pfx = selfSignedPfx('EMPRESA TESTE:11444777000161', 'senha');
const { cert } = pfxToPem(pfx, 'senha');

test('evento de manifestação assinado (RSA-SHA1, C14N, enveloped) é válido', () => {
  const xml = new ManifestClient().buildEvent({ cnpj: '11444777000161', accessKey: '2'.repeat(44), type: 'CONFIRMACAO', tpAmb: 2 });
  const signed = signXml(xml, { pfx, passphrase: 'senha', referenceTag: 'infEvento', parentTag: 'evento' });
  assert.match(signed, /<Signature[\s\S]*<X509Certificate>/);
  assert.match(signed, /Reference URI="#ID2102002{44}01"/);
  assert.equal(verify(signed, cert), true);
  assert.equal(verify(signed.replace('<tpAmb>2</tpAmb>', '<tpAmb>1</tpAmb>'), cert), false, 'adulteração detectada');
});

test('DPS da NFS-e assinada com RSA-SHA256 é válida', () => {
  const dps = '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00"><infDPS Id="DPS270430221144477700016100001000000000000001"><tpAmb>2</tpAmb><valores><vServPrest><vServ>1500.00</vServ></vServPrest></valores></infDPS></DPS>';
  const signed = signXml(dps, { pfx, passphrase: 'senha', referenceTag: 'infDPS', parentTag: 'DPS', algorithm: 'sha256' });
  assert.match(signed, /rsa-sha256/);
  assert.equal(verify(signed, cert), true);
  assert.equal(verify(signed.replace('1500.00', '15000.00'), cert), false);
});
