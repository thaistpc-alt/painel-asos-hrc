/* Correção de compatibilidade do Apps Script para leitura do cache gzip. */
desserializarCacheV13_ = function(base64) {
  const bytes = Utilities.base64Decode(base64);
  const blobGzip = Utilities.newBlob(bytes, "application/gzip", "cache-v13.gz");
  const json = Utilities.ungzip(blobGzip).getDataAsString("UTF-8");
  return JSON.parse(json);
};
