/**
 * Copy partilhada dos utilitários em `src/lib/` (observações, lua/marés,
 * marcadores do mapa, legendas, janelas). Mesmo padrão dos módulos de
 * `spotPage/`: `{ pt, en, es, de, fr }` + `pickLocale(locale, módulo)`.
 * Placeholders `{x}` iguais nas 5 línguas; usar com `fmtCopy`/`replace`.
 */

/** «agora» / «há 12 min» / «há 3h05» — idade das observações. */
export const libObservedAge = {
  pt: {
    now: 'agora',
    mins: 'há {m} min',
    hours: 'há {h}h',
    hoursMins: 'há {h}h{m}m',
  },
  en: {
    now: 'just now',
    mins: '{m} min ago',
    hours: '{h}h ago',
    hoursMins: '{h}h {m}m ago',
  },
  es: {
    now: 'ahora',
    mins: 'hace {m} min',
    hours: 'hace {h} h',
    hoursMins: 'hace {h} h {m} min',
  },
  de: {
    now: 'jetzt',
    mins: 'vor {m} Min.',
    hours: 'vor {h} Std.',
    hoursMins: 'vor {h} Std. {m} Min.',
  },
  fr: {
    now: 'maintenant',
    mins: 'il y a {m} min',
    hours: 'il y a {h} h',
    hoursMins: 'il y a {h} h {m} min',
  },
};

/** Weekday de 3 letras para a régua de horas (estável, sem Intl). */
export const libWeekdays = {
  pt: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  fr: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'],
};

/** Mês curto para a régua de horas (estável, sem Intl). */
export const libMonths = {
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  fr: ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'],
};

/** Alt text das imagens lifestyle das regiões (`getRegionLifestyleAlt`). */
export const libRegionNames = {
  pt: {
    norte: 'Costa norte de Portugal',
    centro: 'Costa centro de Portugal',
    lisboa: 'Costa de Lisboa',
    alentejo: 'Costa alentejana',
    algarve: 'Costa do Algarve',
    acores: 'Arquipélago dos Açores',
    madeira: 'Ilha da Madeira',
  },
  en: {
    norte: 'Northern coast of Portugal',
    centro: 'Central coast of Portugal',
    lisboa: 'Lisbon coast',
    alentejo: 'Alentejo coast',
    algarve: 'Algarve coast',
    acores: 'Azores archipelago',
    madeira: 'Madeira island',
  },
  es: {
    norte: 'Costa norte de Portugal',
    centro: 'Costa central de Portugal',
    lisboa: 'Costa de Lisboa',
    alentejo: 'Costa del Alentejo',
    algarve: 'Costa del Algarve',
    acores: 'Archipiélago de las Azores',
    madeira: 'Isla de Madeira',
  },
  de: {
    norte: 'Nordküste Portugals',
    centro: 'Zentralküste Portugals',
    lisboa: 'Küste von Lissabon',
    alentejo: 'Küste des Alentejo',
    algarve: 'Algarve-Küste',
    acores: 'Archipel der Azoren',
    madeira: 'Insel Madeira',
  },
  fr: {
    norte: 'Côte nord du Portugal',
    centro: 'Côte centrale du Portugal',
    lisboa: 'Côte de Lisbonne',
    alentejo: "Côte de l'Alentejo",
    algarve: "Côte de l'Algarve",
    acores: 'Archipel des Açores',
    madeira: 'Île de Madère',
  },
};

/** Nomes das fases da lua (chaves fixas de `moonPhase.ts`). */
export const libMoonPhases = {
  pt: {
    nova: 'Lua nova',
    crescente: 'Lua crescente',
    'quarto-crescente': 'Quarto crescente',
    'gibosa-crescente': 'Gibosa crescente',
    cheia: 'Lua cheia',
    'gibosa-minguante': 'Gibosa minguante',
    'quarto-minguante': 'Quarto minguante',
    minguante: 'Lua minguante',
  },
  en: {
    nova: 'New moon',
    crescente: 'Waxing crescent',
    'quarto-crescente': 'First quarter',
    'gibosa-crescente': 'Waxing gibbous',
    cheia: 'Full moon',
    'gibosa-minguante': 'Waning gibbous',
    'quarto-minguante': 'Last quarter',
    minguante: 'Waning crescent',
  },
  es: {
    nova: 'Luna nueva',
    crescente: 'Luna creciente',
    'quarto-crescente': 'Cuarto creciente',
    'gibosa-crescente': 'Gibosa creciente',
    cheia: 'Luna llena',
    'gibosa-minguante': 'Gibosa menguante',
    'quarto-minguante': 'Cuarto menguante',
    minguante: 'Luna menguante',
  },
  de: {
    nova: 'Neumond',
    crescente: 'Zunehmende Sichel',
    'quarto-crescente': 'Erstes Viertel',
    'gibosa-crescente': 'Zunehmender Gibbous',
    cheia: 'Vollmond',
    'gibosa-minguante': 'Abnehmender Gibbous',
    'quarto-minguante': 'Letztes Viertel',
    minguante: 'Abnehmende Sichel',
  },
  fr: {
    nova: 'Nouvelle lune',
    crescente: 'Premier croissant',
    'quarto-crescente': 'Premier quartier',
    'gibosa-crescente': 'Gibbeuse croissante',
    cheia: 'Pleine lune',
    'gibosa-minguante': 'Gibbeuse décroissante',
    'quarto-minguante': 'Dernier quartier',
    minguante: 'Dernier croissant',
  },
};

/** Regimes de maré (vivas/mortas/transição). */
export const libTideRegimes = {
  pt: { vivas: 'Marés vivas', mortas: 'Marés mortas', 'transição': 'Transição' },
  en: { vivas: 'Spring tides', mortas: 'Neap tides', 'transição': 'Transition' },
  es: { vivas: 'Mareas vivas', mortas: 'Mareas muertas', 'transição': 'Transición' },
  de: { vivas: 'Springtiden', mortas: 'Nipptiden', 'transição': 'Übergang' },
  fr: { vivas: 'Marées de vives-eaux', mortas: 'Marées de mortes-eaux', 'transição': 'Transition' },
};

/** Explicação curta de cada regime de maré. */
export const libTideRegimeMeanings = {
  pt: {
    vivas: 'A maré enche e vaza mais — baixa-mar expõe mais fundo; correntes mais fortes.',
    mortas: 'A maré enche e vaza menos — marés estáveis; menos exposição do fundo.',
    'transição': 'Entre vivas e mortas — condições intermédias.',
  },
  en: {
    vivas: 'Larger range — low tide exposes more bottom; stronger currents.',
    mortas: 'Smaller range — steadier tides; less bottom exposure.',
    'transição': 'Between spring and neap — intermediate conditions.',
  },
  es: {
    vivas: 'Amplitud mayor — la bajamar expone más fondo; corrientes más fuertes.',
    mortas: 'Amplitud menor — mareas más estables; menos fondo expuesto.',
    'transição': 'Entre vivas y muertas — condiciones intermedias.',
  },
  de: {
    vivas: 'Größerer Tidenhub — bei Niedrigwasser wird mehr Grund freigelegt; stärkere Strömungen.',
    mortas: 'Kleinerer Tidenhub — stabilere Gezeiten; weniger freigelegter Grund.',
    'transição': 'Zwischen Spring- und Nipptide — mittlere Bedingungen.',
  },
  fr: {
    vivas: 'Amplitude plus forte — la marée basse découvre plus de fond ; courants plus forts.',
    mortas: 'Amplitude plus faible — marées plus stables ; moins de fond découvert.',
    'transição': 'Entre vives-eaux et mortes-eaux — conditions intermédiaires.',
  },
};

/** Linha «Lua cheia · Marés vivas · baixa-mar 06:12» do Dawn Patrol. */
export const libDawnMoonLine = {
  pt: '{phase} · {regime} · baixa-mar {time}',
  en: '{phase} · {regime} · low tide {time}',
  es: '{phase} · {regime} · bajamar {time}',
  de: '{phase} · {regime} · Niedrigwasser {time}',
  fr: '{phase} · {regime} · marée basse {time}',
};

/**
 * Title do anel de vento no marcador do mapa — com e sem a relação
 * offshore/onshore/cross.
 */
export const libWindRingTitle = {
  pt: {
    withRel: '{kt} kt de {card} · {rel} · arco = para onde sopra',
    noRel: '{kt} kt de {card} · arco = para onde sopra',
  },
  en: {
    withRel: '{kt} kt from {card} · {rel} · arc = flow direction',
    noRel: '{kt} kt from {card} · arc = flow direction',
  },
  es: {
    withRel: '{kt} kt de {card} · {rel} · arco = dirección del flujo',
    noRel: '{kt} kt de {card} · arco = dirección del flujo',
  },
  de: {
    withRel: '{kt} kt aus {card} · {rel} · Bogen = Windrichtung',
    noRel: '{kt} kt aus {card} · Bogen = Windrichtung',
  },
  fr: {
    withRel: '{kt} kt de {card} · {rel} · arc = direction du flux',
    noRel: '{kt} kt de {card} · arc = direction du flux',
  },
};

/** Prefixo do aviso IPMA no title do marcador («Aviso IPMA: Vento (Laranja)»). */
export const libIpmaWarningTitle = {
  pt: 'Aviso IPMA: {label} ({level})',
  en: 'IPMA warning: {label} ({level})',
  es: 'Aviso del IPMA: {label} ({level})',
  de: 'IPMA-Warnung: {label} ({level})',
  fr: 'Avertissement IPMA : {label} ({level})',
};

/** Rótulos da escala da legenda do mapa (fechado → épico). */
export const libLegendLabels = {
  pt: ['Fechado', 'Fraco', 'Razoável', 'Bom', 'Épico'],
  en: ['Closed', 'Poor', 'Fair', 'Good', 'Epic'],
  es: ['Cerrado', 'Flojo', 'Aceptable', 'Bueno', 'Épico'],
  de: ['Geschlossen', 'Schwach', 'Mäßig', 'Gut', 'Episch'],
  fr: ['Fermé', 'Faible', 'Correct', 'Bon', 'Épique'],
};

/** URL do radar do IPMA — o site só existe em pt e en (resto → en). */
export const libIpmaRadarUrl = {
  pt: 'https://www.ipma.pt/pt/otempo/obs.radar/',
  en: 'https://www.ipma.pt/en/otempo/obs.radar/',
};

/** Sufixo «(amanhã)» de uma janela que passa a meia-noite. */
export const libTomorrowSuffix = {
  pt: 'amanhã',
  en: 'tomorrow',
  es: 'mañana',
  de: 'morgen',
  fr: 'demain',
};

/**
 * Rosa dos ventos de 8 pontos para movimento de tempestades NHC — para onde
 * a tempestade VAI. pt/es/fr partilham as abreviaturas (SO/O/NO); de usa
 * NO/O/SO; en usa SW/W/NW.
 */
export const libStormCardinals = {
  pt: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  es: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  de: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'],
  fr: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
};
