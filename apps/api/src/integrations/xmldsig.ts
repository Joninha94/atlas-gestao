import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

/** Converte o PFX (A1) em chave privada e certificado PEM, só em memória. */
export function pfxToPem(pfx: Buffer, passphrase: string) {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString('binary')), passphrase);
  const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!keyBag?.key || !certBag?.cert) throw new Error('Certificado A1 inválido.');
  return { key: forge.pki.privateKeyToPem(keyBag.key), cert: forge.pki.certificateToPem(certBag.cert) };
}

/**
 * Assinatura XMLDSig "enveloped" no padrão da NF-e/NFS-e:
 * referencia o elemento com atributo Id (ex.: infEvento, infDPS), C14N, e insere <Signature>
 * como último filho do elemento pai.
 */
export function signXml(
  xml: string,
  opts: { pfx: Buffer; passphrase: string; referenceTag: string; parentTag: string; algorithm?: 'sha1' | 'sha256' },
) {
  const { key, cert } = pfxToPem(opts.pfx, opts.passphrase);
  const sha256 = opts.algorithm === 'sha256';
  const sig = new SignedXml({
    privateKey: key,
    publicCert: cert,
    signatureAlgorithm: sha256 ? 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' : 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath: `//*[local-name(.)='${opts.referenceTag}']`,
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    digestAlgorithm: sha256 ? 'http://www.w3.org/2001/04/xmlenc#sha256' : 'http://www.w3.org/2000/09/xmldsig#sha1',
  });
  sig.computeSignature(xml, { location: { reference: `//*[local-name(.)='${opts.parentTag}']`, action: 'append' } });
  return sig.getSignedXml();
}

/** Certificado autoassinado para testes automatizados da assinatura (nunca usar em produção). */
export function selfSignedPfx(cn: string, passphrase: string) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const attrs = [{ name: 'commonName', value: cn }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}
