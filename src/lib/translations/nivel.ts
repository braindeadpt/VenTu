/**
 * nivel — o nível do utilizador na home e no spot v6 «Atlântico» (#nivel-ui).
 * PT-PT é a fonte (maquete aprovada `work/maquete-nivel`, estudo §3–§4); as
 * outras quatro línguas do i18n seguem a mesma forma. Marcas como no motor
 * da home: `<em>` = a banda, pintada em chip (`Frase`).
 *
 * O nível é o do filtro do /mapa e da lista de spots (`ventu:map:difficulty`,
 * `src/lib/mapDifficulty.ts`): os mesmos ids, lidos como um tecto.
 */
import type { Modalidade } from '@/lib/modalidades';
import type { MapDifficultyFilter, NivelUtilizador } from '@/lib/mapDifficulty';
import type { Spot } from '@/types';

type NivelSpot = Spot['difficulty'];

export interface NivelCopy {
  /** Rótulo do botão sem nível escolhido. */
  botao: string;
  botaoAria: (nome: string | null) => string;
  menuT: string;
  menuNota: string;
  /** Opções do menu (ids do filtro do /mapa), pela ordem do menu. */
  nome: Record<MapDifficultyFilter, string>;
  /** Nome no botão do telemóvel (58 px de largura, 12 px): curto quando o nome não cabe. */
  nomeCurto: Record<NivelUtilizador, string>;
  desc: Record<MapDifficultyFilter, string>;
  /** O nível do utilizador dentro de uma frase («para iniciante»). */
  nomeFrase: Record<NivelUtilizador, string>;
  /** Etiqueta de um spot («Spot para avançados»). */
  tag: (lv: NivelSpot) => string;
  /** Dica sem nível escolhido («Spot para avançados em kite.»). */
  dica: (lv: NivelSpot, d: Modalidade) => string;
  qualNivel: string;
  /** «· iniciante» no rótulo do nº k. */
  rkNivel: (nv: NivelUtilizador) => string;
  /** «nº 2 da costa agora» nos cartões acima do nível. */
  nCosta: (n: number, quando: string) => string;
  /** « fica de fora: é um spot para avançados.» (a seguir ao nome e à nota). */
  foraResto: (lv: NivelSpot) => string;
  poucosT: (dar: number, total: number, nv: NivelUtilizador, quando: string) => string;
  proximo: (bloco: string, spot: string) => string;
  nuncaMais: string;
  marcados: string;
  soNivel: string;
  /** A frase do nível, no lugar da frase nacional, nos casos «poucos» e «zero». */
  fraseZero: (nv: NivelUtilizador, d: Modalidade, quando: string, spot: string, banda: string) => string;
  /** `banda` null = sem chip (a banda «dá» repetia o verbo: «só X dá …: dá.»). */
  fraseUm: (nv: NivelUtilizador, quando: string, spot: string, banda: string | null) => string;
  fraseDois: (nv: NivelUtilizador, quando: string, a: string, b: string, banda: string | null) => string;
  legenda: string;
  /** Porquê do aviso, a partir dos perigos do spot (vazio = só a segunda parte). */
  porque: (perigos: string[], d: Modalidade) => string;
  escolheste: (nv: NivelUtilizador) => string;
  pertoChips: string;
  pertoLink: (n: number, nv: NivelUtilizador) => string;
  nenhumPerto: (nv: NivelUtilizador) => string;
  verCosta: string;
  pertoT: string;
  pertoSub: (nv: NivelUtilizador, km: number) => string;
  pertoKm: (km: string, lv: NivelSpot) => string;
  /** «Nível» no «Chegar e estar». */
  porConfirmar: string;
  nivelEm: (rotulo: string, d: Modalidade) => string;
  /** Perigos traduzidos? (pt e en têm as etiquetas dos perigos; as outras línguas usam só a 2.ª parte) */
  comPerigos: 'pt' | 'en' | null;
}

const listaPt = (a: string[]) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]);
const listaEn = (a: string[]) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const cap = (s: string) => s.replace(/^./, (x) => x.toUpperCase());
const perigosTxt = (p: string[], lista: (a: string[]) => string) => cap(lista(p.map((x, k) => (k ? x.charAt(0).toLowerCase() + x.slice(1) : x))));

const PT_PARA: Record<NivelSpot, string> = {
  beginner: 'para iniciantes',
  intermediate: 'para intermédios',
  advanced: 'para avançados',
  expert: 'para experientes',
  all: 'para todos',
};

const pt: NivelCopy = {
  botao: 'Nível',
  botaoAria: (n) => (n ? `O teu nível: ${n}. Mudar` : 'Escolher o teu nível'),
  menuT: 'O teu nível',
  menuNota: 'A nota não muda. O nível escolhe o top 3 e avisa nos spots acima dele. É o mesmo do mapa e da lista de spots.',
  nome: { beginner: 'Iniciante', intermediate: 'Intermédio', advanced: 'Avançado', all: 'Todos' },
  nomeCurto: { beginner: 'Iniciante', intermediate: 'Intermédio', advanced: 'Avançado' },
  desc: {
    beginner: 'Só spots marcados para iniciantes',
    intermediate: 'Spots de iniciante e de intermédio',
    advanced: 'Todos os spots',
    all: 'Sem filtro (como hoje)',
  },
  nomeFrase: { beginner: 'iniciante', intermediate: 'intermédio', advanced: 'avançado' },
  tag: (lv) => `Spot ${PT_PARA[lv]}`,
  dica: (lv, d) => `Spot ${PT_PARA[lv]} em ${d}.`,
  qualNivel: 'Qual é o teu nível?',
  rkNivel: (nv) => pt.nomeFrase[nv],
  nCosta: (n, q) => `nº ${n} da costa ${q}`,
  foraResto: (lv) => ` fica de fora: é um spot ${PT_PARA[lv]}.`,
  poucosT: (dar, tot, nv, q) => {
    const para = PT_PARA[nv];
    if (!dar) return `Nenhum dos ${tot} spots ${para} dá ${q}.`;
    return `Só ${dar} dos ${tot} spots ${para} ${dar === 1 ? 'dá' : 'dão'} ${q}.`;
  },
  proximo: (b, s) => `O próximo «dá» do teu nível é ${b}, em ${s}.`,
  nuncaMais: 'Nos próximos dois dias, também não.',
  marcados: 'Mostramos também os melhores da costa, marcados: pedem mais nível.',
  soNivel: 'O top 3 mostra o melhor do teu nível, mesmo fraco.',
  fraseZero: (nv, d, q, s, b) => `Para ${pt.nomeFrase[nv]}, o ${d} não dá em lado nenhum ${q}. O melhor do teu nível é ${s}: <em>${b}</em>.`,
  fraseUm: (nv, q, s, b) => `Para ${pt.nomeFrase[nv]}, só ${s} dá ${q}${b ? `: <em>${b}</em>` : ''}.`,
  fraseDois: (nv, q, a, s, b) => `Para ${pt.nomeFrase[nv]}, só ${a} e ${s} dão ${q}${b ? `: <em>${b}</em> no melhor` : ''}.`,
  legenda: 'esbatido: acima do teu nível',
  porque: (p, d) => (p.length ? `${perigosTxt(p, listaPt)}: aqui o ${d} pede experiência.` : `Aqui o ${d} pede experiência.`),
  escolheste: (nv) => `Escolheste ${pt.nomeFrase[nv]}.`,
  pertoChips: 'Do teu nível, perto:',
  pertoLink: (n, nv) => `${n} ${n === 1 ? 'spot' : 'spots'} de ${pt.nomeFrase[nv]} perto`,
  nenhumPerto: (nv) => `Nenhum spot de ${pt.nomeFrase[nv]} a menos de 80\u00a0km.`,
  verCosta: 'Ver a costa',
  pertoT: 'Do teu nível, perto daqui',
  pertoSub: (nv, km) => `Para ${pt.nomeFrase[nv]}, a menos de ${km}\u00a0km:`,
  pertoKm: (km, lv) => `${km} · ${PT_PARA[lv]}`,
  porConfirmar: 'por confirmar',
  nivelEm: (r, d) => `${r.toLowerCase()} em ${d}`,
  comPerigos: 'pt',
};

const EN_FOR: Record<NivelSpot, string> = {
  beginner: 'for beginners',
  intermediate: 'for intermediates',
  advanced: 'for advanced riders',
  expert: 'for experts',
  all: 'for all levels',
};

const en: NivelCopy = {
  botao: 'Level',
  botaoAria: (n) => (n ? `Your level: ${n}. Change` : 'Choose your level'),
  menuT: 'Your level',
  menuNota: 'The score does not change. Your level picks the top 3 and flags spots above it. It is the same as on the map and the spot list.',
  nome: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all: 'All' },
  nomeCurto: { beginner: 'Beginner', intermediate: 'Interm.', advanced: 'Advanced' },
  desc: {
    beginner: 'Only spots marked for beginners',
    intermediate: 'Beginner and intermediate spots',
    advanced: 'Every spot',
    all: 'No filter (as before)',
  },
  nomeFrase: { beginner: 'beginners', intermediate: 'intermediates', advanced: 'advanced riders' },
  tag: (lv) => `Spot ${EN_FOR[lv]}`,
  dica: (lv, d) => `${d === 'kite' ? 'Kite' : 'Surf'} spot ${EN_FOR[lv]}.`,
  qualNivel: 'What is your level?',
  rkNivel: (nv) => ({ beginner: 'beginner', intermediate: 'intermediate', advanced: 'advanced' })[nv],
  nCosta: (n, q) => `no. ${n} on the coast ${q}`,
  foraResto: (lv) => ` is left out: it is a spot ${EN_FOR[lv]}.`,
  poucosT: (dar, tot, nv, q) => {
    const para = EN_FOR[nv];
    if (!dar) return `None of the ${tot} spots ${para} works ${q}.`;
    return `Only ${dar} of the ${tot} spots ${para} ${dar === 1 ? 'works' : 'work'} ${q}.`;
  },
  proximo: (b, s) => `The next time one of your level works is ${b}, at ${s}.`,
  nuncaMais: 'Not in the next two days either.',
  marcados: 'We also show the best on the coast, flagged: they need more experience.',
  soNivel: 'The top 3 shows the best of your level, even if poor.',
  fraseZero: (nv, d, q, s, b) => `For ${en.nomeFrase[nv]}, ${d} is a no go everywhere ${q}. The best of your level is ${s}: <em>${b}</em>.`,
  fraseUm: (nv, q, s, b) => `For ${en.nomeFrase[nv]}, only ${s} works ${q}${b ? `: <em>${b}</em>` : ''}.`,
  fraseDois: (nv, q, a, s, b) => `For ${en.nomeFrase[nv]}, only ${a} and ${s} work ${q}${b ? `: <em>${b}</em> at best` : ''}.`,
  legenda: 'faded: above your level',
  porque: (p, d) => (p.length ? `${perigosTxt(p, listaEn)}: ${d} here takes experience.` : `${cap(d)} here takes experience.`),
  escolheste: (nv) => `You chose ${en.rkNivel(nv)}.`,
  pertoChips: 'Your level, nearby:',
  pertoLink: (n, nv) => `${n} ${en.rkNivel(nv)} ${n === 1 ? 'spot' : 'spots'} nearby`,
  nenhumPerto: (nv) => `No ${en.rkNivel(nv)} spot within 80\u00a0km.`,
  verCosta: 'See the coast',
  pertoT: 'Your level, nearby',
  pertoSub: (nv, km) => `For ${en.nomeFrase[nv]}, within ${km}\u00a0km:`,
  pertoKm: (km, lv) => `${km} · ${EN_FOR[lv]}`,
  porConfirmar: 'to be confirmed',
  nivelEm: (r, d) => `${r.toLowerCase()} for ${d}`,
  comPerigos: 'en',
};

const ES_PARA: Record<NivelSpot, string> = {
  beginner: 'para principiantes',
  intermediate: 'para intermedios',
  advanced: 'para avanzados',
  expert: 'para expertos',
  all: 'para todos',
};

const es: NivelCopy = {
  botao: 'Nivel',
  botaoAria: (n) => (n ? `Tu nivel: ${n}. Cambiar` : 'Elegir tu nivel'),
  menuT: 'Tu nivel',
  menuNota: 'La nota no cambia. El nivel elige el top 3 y avisa en los spots por encima. Es el mismo del mapa y de la lista de spots.',
  nome: { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado', all: 'Todos' },
  nomeCurto: { beginner: 'Princ.', intermediate: 'Interm.', advanced: 'Avanzado' },
  desc: {
    beginner: 'Solo spots marcados para principiantes',
    intermediate: 'Spots de principiante y de intermedio',
    advanced: 'Todos los spots',
    all: 'Sin filtro (como antes)',
  },
  nomeFrase: { beginner: 'principiante', intermediate: 'intermedio', advanced: 'avanzado' },
  tag: (lv) => `Spot ${ES_PARA[lv]}`,
  dica: (lv, d) => `Spot ${ES_PARA[lv]} en ${d}.`,
  qualNivel: '¿Cuál es tu nivel?',
  rkNivel: (nv) => es.nomeFrase[nv],
  nCosta: (n, q) => `n.º ${n} de la costa ${q}`,
  foraResto: (lv) => ` queda fuera: es un spot ${ES_PARA[lv]}.`,
  poucosT: (dar, tot, nv, q) => {
    const para = ES_PARA[nv];
    if (!dar) return `Ninguno de los ${tot} spots ${para} funciona ${q}.`;
    return `Solo ${dar} de los ${tot} spots ${para} ${dar === 1 ? 'funciona' : 'funcionan'} ${q}.`;
  },
  proximo: (b, s) => `La próxima vez que funciona uno de tu nivel es ${b}, en ${s}.`,
  nuncaMais: 'En los próximos dos días, tampoco.',
  marcados: 'Mostramos también los mejores de la costa, marcados: piden más nivel.',
  soNivel: 'El top 3 muestra lo mejor de tu nivel, aunque sea flojo.',
  fraseZero: (nv, d, q, s, b) => `Para ${es.nomeFrase[nv]}, el ${d} no funciona en ningún sitio ${q}. Lo mejor de tu nivel es ${s}: <em>${b}</em>.`,
  fraseUm: (nv, q, s, b) => `Para ${es.nomeFrase[nv]}, solo ${s} funciona ${q}${b ? `: <em>${b}</em>` : ''}.`,
  fraseDois: (nv, q, a, s, b) => `Para ${es.nomeFrase[nv]}, solo ${a} y ${s} funcionan ${q}${b ? `: <em>${b}</em> en el mejor` : ''}.`,
  legenda: 'atenuado: por encima de tu nivel',
  porque: (_p, d) => `Aquí el ${d} pide experiencia.`,
  escolheste: (nv) => `Elegiste ${es.nomeFrase[nv]}.`,
  pertoChips: 'De tu nivel, cerca:',
  pertoLink: (n, nv) => `${n} ${n === 1 ? 'spot' : 'spots'} de ${es.nomeFrase[nv]} cerca`,
  nenhumPerto: (nv) => `Ningún spot de ${es.nomeFrase[nv]} a menos de 80\u00a0km.`,
  verCosta: 'Ver la costa',
  pertoT: 'De tu nivel, cerca de aquí',
  pertoSub: (nv, km) => `Para ${es.nomeFrase[nv]}, a menos de ${km}\u00a0km:`,
  pertoKm: (km, lv) => `${km} · ${ES_PARA[lv]}`,
  porConfirmar: 'por confirmar',
  nivelEm: (r, d) => `${r.toLowerCase()} en ${d}`,
  comPerigos: null,
};

const DE_FUER: Record<NivelSpot, string> = {
  beginner: 'für Anfänger',
  intermediate: 'für Fortgeschrittene',
  advanced: 'für Könner',
  expert: 'für Experten',
  all: 'für alle',
};
const deSport = (d: Modalidade) => (d === 'kite' ? 'Kiten' : 'Surfen');

const de: NivelCopy = {
  botao: 'Niveau',
  botaoAria: (n) => (n ? `Dein Niveau: ${n}. Ändern` : 'Dein Niveau wählen'),
  menuT: 'Dein Niveau',
  menuNota: 'Die Note ändert sich nicht. Das Niveau wählt die Top 3 und warnt bei Spots darüber. Es ist dasselbe wie auf der Karte und in der Spot-Liste.',
  nome: { beginner: 'Anfänger', intermediate: 'Mittelstufe', advanced: 'Könner', all: 'Alle' },
  nomeCurto: { beginner: 'Anfänger', intermediate: 'Mittel', advanced: 'Könner' },
  desc: {
    beginner: 'Nur Spots für Anfänger',
    intermediate: 'Spots für Anfänger und Mittelstufe',
    advanced: 'Alle Spots',
    all: 'Kein Filter (wie bisher)',
  },
  nomeFrase: { beginner: 'Anfänger', intermediate: 'die Mittelstufe', advanced: 'Könner' },
  tag: (lv) => `Spot ${DE_FUER[lv]}`,
  dica: (lv, d) => `Spot ${DE_FUER[lv]} beim ${deSport(d)}.`,
  qualNivel: 'Was ist dein Niveau?',
  rkNivel: (nv) => de.nome[nv],
  nCosta: (n, q) => `Nr. ${n} der Küste ${q}`,
  foraResto: (lv) => ` fällt raus: ein Spot ${DE_FUER[lv]}.`,
  poucosT: (dar, tot, nv, q) => {
    const f = DE_FUER[nv];
    if (!dar) return `Keiner der ${tot} Spots ${f} geht ${q}.`;
    return `Nur ${dar} der ${tot} Spots ${f} ${dar === 1 ? 'geht' : 'gehen'} ${q}.`;
  },
  proximo: (b, s) => `Das nächste Mal geht einer deines Niveaus ${b}, in ${s}.`,
  nuncaMais: 'Auch in den nächsten zwei Tagen nicht.',
  marcados: 'Wir zeigen auch die Besten der Küste, markiert: Sie verlangen mehr Können.',
  soNivel: 'Die Top 3 zeigen das Beste deines Niveaus, auch wenn es schwach ist.',
  fraseZero: (nv, d, q, s, b) => `Für ${de.nomeFrase[nv]} geht ${deSport(d)} ${q} nirgends. Das Beste deines Niveaus ist ${s}: <em>${b}</em>.`,
  fraseUm: (nv, q, s, b) => `Für ${de.nomeFrase[nv]} geht ${q} nur ${s}${b ? `: <em>${b}</em>` : ''}.`,
  fraseDois: (nv, q, a, s, b) => `Für ${de.nomeFrase[nv]} gehen ${q} nur ${a} und ${s}${b ? `: <em>${b}</em> im besten Fall` : ''}.`,
  legenda: 'blass: über deinem Niveau',
  porque: (_p, d) => `${deSport(d)} verlangt hier Erfahrung.`,
  escolheste: (nv) => `Du hast ${de.nome[nv]} gewählt.`,
  pertoChips: 'Dein Niveau, in der Nähe:',
  pertoLink: (n, nv) => `${n} ${n === 1 ? 'Spot' : 'Spots'} (${de.nome[nv]}) in der Nähe`,
  nenhumPerto: (nv) => `Kein Spot (${de.nome[nv]}) im Umkreis von 80\u00a0km.`,
  verCosta: 'Zur Küste',
  pertoT: 'Dein Niveau, in der Nähe',
  pertoSub: (nv, km) => `Für ${de.nomeFrase[nv]}, im Umkreis von ${km}\u00a0km:`,
  pertoKm: (km, lv) => `${km} · ${DE_FUER[lv]}`,
  porConfirmar: 'noch offen',
  nivelEm: (r, d) => `${r} beim ${deSport(d)}`,
  comPerigos: null,
};

const FR_POUR: Record<NivelSpot, string> = {
  beginner: 'pour débutants',
  intermediate: 'pour intermédiaires',
  advanced: 'pour confirmés',
  expert: 'pour experts',
  all: 'pour tous',
};

const fr: NivelCopy = {
  botao: 'Niveau',
  botaoAria: (n) => (n ? `Ton niveau : ${n}. Changer` : 'Choisir ton niveau'),
  menuT: 'Ton niveau',
  menuNota: 'La note ne change pas. Le niveau choisit le top 3 et prévient sur les spots au-dessus. C’est le même que sur la carte et la liste des spots.',
  nome: { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Confirmé', all: 'Tous' },
  nomeCurto: { beginner: 'Débutant', intermediate: 'Interm.', advanced: 'Confirmé' },
  desc: {
    beginner: 'Seulement les spots pour débutants',
    intermediate: 'Spots débutant et intermédiaire',
    advanced: 'Tous les spots',
    all: 'Sans filtre (comme avant)',
  },
  nomeFrase: { beginner: 'débutant', intermediate: 'intermédiaire', advanced: 'confirmé' },
  tag: (lv) => `Spot ${FR_POUR[lv]}`,
  dica: (lv, d) => `Spot ${FR_POUR[lv]} en ${d}.`,
  qualNivel: 'Quel est ton niveau ?',
  rkNivel: (nv) => fr.nomeFrase[nv],
  nCosta: (n, q) => `nº ${n} de la côte ${q}`,
  foraResto: (lv) => ` reste dehors : c’est un spot ${FR_POUR[lv]}.`,
  poucosT: (dar, tot, nv, q) => {
    const p = FR_POUR[nv];
    if (!dar) return `Aucun des ${tot} spots ${p} ne marche ${q}.`;
    return `Seulement ${dar} des ${tot} spots ${p} ${dar === 1 ? 'marche' : 'marchent'} ${q}.`;
  },
  proximo: (b, s) => `La prochaine fois qu’un spot de ton niveau marche : ${b}, à ${s}.`,
  nuncaMais: 'Pas non plus dans les deux prochains jours.',
  marcados: 'On montre aussi les meilleurs de la côte, signalés : ils demandent plus de niveau.',
  soNivel: 'Le top 3 montre le meilleur de ton niveau, même faible.',
  fraseZero: (nv, d, q, s, b) => `Pour ${fr.nomeFrase[nv]}, le ${d} ne marche nulle part ${q}. Le meilleur de ton niveau, c’est ${s} : <em>${b}</em>.`,
  fraseUm: (nv, q, s, b) => `Pour ${fr.nomeFrase[nv]}, seul ${s} marche ${q}${b ? ` : <em>${b}</em>` : ''}.`,
  fraseDois: (nv, q, a, s, b) => `Pour ${fr.nomeFrase[nv]}, seuls ${a} et ${s} marchent ${q}${b ? ` : <em>${b}</em> au mieux` : ''}.`,
  legenda: 'estompé : au-dessus de ton niveau',
  porque: (_p, d) => `Ici, le ${d} demande de l’expérience.`,
  escolheste: (nv) => `Tu as choisi ${fr.nomeFrase[nv]}.`,
  pertoChips: 'De ton niveau, près d’ici :',
  pertoLink: (n, nv) => `${n} ${n === 1 ? 'spot' : 'spots'} ${nv === 'beginner' ? 'débutant' : fr.nomeFrase[nv]} près d’ici`,
  nenhumPerto: (nv) => `Aucun spot ${fr.nomeFrase[nv]} à moins de 80\u00a0km.`,
  verCosta: 'Voir la côte',
  pertoT: 'De ton niveau, près d’ici',
  pertoSub: (nv, km) => `Pour ${fr.nomeFrase[nv]}, à moins de ${km}\u00a0km :`,
  pertoKm: (km, lv) => `${km} · ${FR_POUR[lv]}`,
  porConfirmar: 'à confirmer',
  nivelEm: (r, d) => `${r.toLowerCase()} en ${d}`,
  comPerigos: null,
};

export const NIVEL_COPY = { pt, en, es, de, fr } as const;

/**
 * Sem importar o i18n (o bundle da home não o carrega por isto): língua desconhecida → PT.
 * Só para o que fica ao lado de texto do i18n completo (a linha «Nível» do «Chegar e estar»,
 * cujo rótulo e valor vêm de `getTranslation`/`getDifficultyLabel` na língua da página).
 */
export function nivelCopy(locale: string): NivelCopy {
  return (NIVEL_COPY as Record<string, NivelCopy>)[locale] ?? pt;
}

/**
 * A cópia do nível na home e no spot v6: a mesma língua que a v6 desenha. A v6 só tem PT e
 * EN (`homeV6Copy`/`spotV6Copy` caem para EN em es/de/fr), por isso o nível também: numa
 * página /es/ a palavra, a frase e o aviso saem em inglês, como o resto do hero.
 */
export function nivelCopyV6(locale: string): NivelCopy {
  return locale === 'pt' ? pt : en;
}
