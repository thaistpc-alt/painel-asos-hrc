/* =========================================================
   UTILITÁRIOS
========================================================= */

const MEMO_TEXTO_NORMALIZADO = new Map();
const MEMO_DATA_ISO = new Map();
const LIMITE_MEMO_UTILITARIOS = 5000;

function memorizarUtilitario(mapa, chave, valor) {
  if (mapa.size >= LIMITE_MEMO_UTILITARIOS) mapa.clear();
  mapa.set(chave, valor);
  return valor;
}

function normalizarTexto(valor) {
  const texto = String(valor || "").trim();
  if (!texto) return "";
  if (MEMO_TEXTO_NORMALIZADO.has(texto)) return MEMO_TEXTO_NORMALIZADO.get(texto);

  return memorizarUtilitario(
    MEMO_TEXTO_NORMALIZADO,
    texto,
    texto.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );
}

function somenteDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function valorTexto(valor) {
  return String(valor || "").trim();
}

function formatarDataISO(valor) {
  if (!valor) return "";

  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor)) {
    const ano = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const dia = String(valor.getDate()).padStart(2, "0");
    return ano + "-" + mes + "-" + dia;
  }

  const texto = String(valor).trim();
  if (!texto) return "";
  if (MEMO_DATA_ISO.has(texto)) return MEMO_DATA_ISO.get(texto);

  const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return memorizarUtilitario(
      MEMO_DATA_ISO,
      texto,
      `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`
    );
  }

  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return memorizarUtilitario(
      MEMO_DATA_ISO,
      texto,
      `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
    );
  }

  const convertido = new Date(texto);
  const resultado = !isNaN(convertido)
    ? [
        convertido.getFullYear(),
        String(convertido.getMonth() + 1).padStart(2, "0"),
        String(convertido.getDate()).padStart(2, "0")
      ].join("-")
    : "";

  return memorizarUtilitario(MEMO_DATA_ISO, texto, resultado);
}

function formatarDataBR(valor) {
  const iso = formatarDataISO(valor);
  if (!iso) return "";
  return `${iso.substring(8, 10)}/${iso.substring(5, 7)}/${iso.substring(0, 4)}`;
}

function dataISOParaDate(dataISO) {
  if (!dataISO) return null;
  const texto = String(dataISO);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  return new Date(Number(texto.substring(0, 4)), Number(texto.substring(5, 7)) - 1, Number(texto.substring(8, 10)));
}

function noPeriodo(dataISO, inicioISO, fimISO) {
  return !!dataISO && !!inicioISO && !!fimISO && dataISO >= inicioISO && dataISO <= fimISO;
}

function adicionarMeses(dataISO, meses) {
  if (!dataISO || !meses) return "";
  const texto = formatarDataISO(dataISO);
  if (!texto) return "";

  const data = new Date(Date.UTC(
    Number(texto.substring(0, 4)),
    Number(texto.substring(5, 7)) - 1,
    Number(texto.substring(8, 10))
  ));
  data.setUTCMonth(data.getUTCMonth() + Number(meses));

  return [
    data.getUTCFullYear(),
    String(data.getUTCMonth() + 1).padStart(2, "0"),
    String(data.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function calcularDiferencaDias(dataFinalISO, dataInicialISO) {
  const finalTexto = formatarDataISO(dataFinalISO);
  const inicialTexto = formatarDataISO(dataInicialISO);
  if (!finalTexto || !inicialTexto) return null;

  const finalUTC = Date.UTC(
    Number(finalTexto.substring(0, 4)),
    Number(finalTexto.substring(5, 7)) - 1,
    Number(finalTexto.substring(8, 10))
  );
  const inicialUTC = Date.UTC(
    Number(inicialTexto.substring(0, 4)),
    Number(inicialTexto.substring(5, 7)) - 1,
    Number(inicialTexto.substring(8, 10))
  );

  return Math.round((finalUTC - inicialUTC) / 86400000);
}

function obterHojeISO() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
}

function obterAnoVigente() {
  return Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy"));
}

function limparNomeArquivo(nome) {
  return String(nome || "")
    .replace(/[\\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function criarChaveCachePortal(sufixo) {
  const seguro = String(sufixo || "")
    .replace(/[^A-Za-z0-9_\-]/g, "_")
    .substring(0, 180);
  return CONFIG.CACHE_PREFIXO + "_" + seguro;
}

function obterCachePortal(sufixo) {
  const cache = CacheService.getScriptCache();
  const chaveBase = criarChaveCachePortal(sufixo);
  const meta = cache.get(chaveBase + "_META");
  if (!meta) return null;

  const qtdPartes = Number(meta) || 0;
  if (!qtdPartes) return null;

  const chaves = Array.from({ length: qtdPartes }, (_, i) => chaveBase + "_P" + i);
  const partes = cache.getAll(chaves);
  let texto = "";

  for (let i = 0; i < qtdPartes; i++) {
    const parte = partes[chaveBase + "_P" + i];
    if (parte === null || parte === undefined) return null;
    texto += parte;
  }

  try {
    return JSON.parse(texto);
  } catch (e) {
    return null;
  }
}

function salvarCachePortal(sufixo, objeto) {
  const cache = CacheService.getScriptCache();
  const chaveBase = criarChaveCachePortal(sufixo);
  const texto = JSON.stringify(objeto);
  const tamanhoParte = 85000;
  const qtdPartes = Math.ceil(texto.length / tamanhoParte);
  const itens = {};

  itens[chaveBase + "_META"] = String(qtdPartes);
  for (let i = 0; i < qtdPartes; i++) {
    itens[chaveBase + "_P" + i] = texto.substring(i * tamanhoParte, (i + 1) * tamanhoParte);
  }

  cache.putAll(itens, CONFIG.CACHE_SEGUNDOS || 300);
}

function limparCachePortal() {
  if (typeof avancarRevisaoCacheV133_ === "function") {
    return avancarRevisaoCacheV133_();
  }
  return true;
}
