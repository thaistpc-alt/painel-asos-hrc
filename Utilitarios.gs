/* =========================================================
   UTILITÁRIOS
========================================================= */

function normalizarTexto(valor) {
  return String(valor || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
    return Utilities.formatDate(valor, CONFIG.TIMEZONE, "yyyy-MM-dd");
  }

  const texto = String(valor).trim();
  if (!texto) return "";

  const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const dia = br[1].padStart(2, "0");
    const mes = br[2].padStart(2, "0");
    const ano = br[3];
    return `${ano}-${mes}-${dia}`;
  }

  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const ano = iso[1];
    const mes = iso[2].padStart(2, "0");
    const dia = iso[3].padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  const convertido = new Date(texto);
  if (!isNaN(convertido)) {
    return Utilities.formatDate(convertido, CONFIG.TIMEZONE, "yyyy-MM-dd");
  }

  return "";
}

function formatarDataBR(valor) {
  const iso = formatarDataISO(valor);
  if (!iso) return "";
  const p = iso.split("-");
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function dataISOParaDate(dataISO) {
  if (!dataISO) return null;
  const p = dataISO.split("-");
  if (p.length !== 3) return null;
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function noPeriodo(dataISO, inicioISO, fimISO) {
  if (!dataISO || !inicioISO || !fimISO) return false;
  return dataISO >= inicioISO && dataISO <= fimISO;
}

function adicionarMeses(dataISO, meses) {
  if (!dataISO || !meses) return "";

  const data = dataISOParaDate(dataISO);
  if (!data) return "";

  data.setMonth(data.getMonth() + Number(meses));

  return Utilities.formatDate(data, CONFIG.TIMEZONE, "yyyy-MM-dd");
}

function calcularDiferencaDias(dataFinalISO, dataInicialISO) {
  if (!dataFinalISO || !dataInicialISO) return null;

  const final = dataISOParaDate(dataFinalISO);
  const inicial = dataISOParaDate(dataInicialISO);

  if (!final || !inicial) return null;

  return Math.round((final - inicial) / (1000 * 60 * 60 * 24));
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

  const chaves = [];
  for (let i = 0; i < qtdPartes; i++) {
    chaves.push(chaveBase + "_P" + i);
  }

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
  // O CacheService não permite limpar por prefixo. A versão no prefixo invalida caches antigos.
  return true;
}

