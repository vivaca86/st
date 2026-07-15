export type StudyCatalogItem = {
  id: string;
  subjectCode: string;
  kind: "formula" | "theory";
  title: string;
  prompt: string;
  content: string;
  canonicalKey: string;
  aliases: string[];
  conditions?: string;
  units?: string;
  caution?: string;
  keywords: string[];
};

export const STUDY_CATALOG: StudyCatalogItem[] = [
  {
    id: "em-polarization-charge",
    subjectCode: "electromagnetics",
    kind: "formula",
    title: "유전체의 분극 전하량",
    prompt: "비유전율 εr인 유전체를 채웠을 때 분극 전하량은?",
    content: "Q′ = −Q(1 − 1/εr)",
    canonicalKey: "Qp=-Q(1-1/er)",
    aliases: ["분극전하", "유전체 표면전하"],
    conditions: "자유전하 Q가 유지되는 유전체 문제",
    units: "C",
    caution: "분극 전하는 자유전하와 반대 부호다.",
    keywords: ["분극 전하", "비유전율", "유전체 표면"],
  },
  {
    id: "em-force-current",
    subjectCode: "electromagnetics",
    kind: "formula",
    title: "자계 속 전류가 받는 힘",
    prompt: "자계 B 속 길이 ℓ의 도선에 전류 I가 흐를 때 힘은?",
    content: "F = BIℓ sin θ",
    canonicalKey: "F=BIl sin(theta)",
    aliases: ["전자력", "도선이 받는 힘"],
    conditions: "B와 도선 방향의 사이각이 θ일 때",
    units: "N",
    caution: "각도는 자계와 전류 방향 사이의 각이다.",
    keywords: ["자계 속 도선", "받는 힘", "sin60", "sin30"],
  },
  {
    id: "em-capacitance",
    subjectCode: "electromagnetics",
    kind: "formula",
    title: "정전용량의 정의",
    prompt: "전하량 Q, 전위 V일 때 정전용량은?",
    content: "C = Q / V",
    canonicalKey: "C=Q/V",
    aliases: ["Q=CV", "정전용량 정의식"],
    conditions: "선형 유전체에서 축적 전하와 전압의 관계",
    units: "F",
    keywords: ["정전용량", "축전기", "콘덴서"],
  },
  {
    id: "machine-transformer-ratio",
    subjectCode: "electric-machines",
    kind: "formula",
    title: "이상 변압기의 권수비",
    prompt: "이상 변압기에서 전압·권수·전류비 관계는?",
    content: "V₁/V₂ = N₁/N₂ = I₂/I₁",
    canonicalKey: "V1/V2=N1/N2=I2/I1",
    aliases: ["변압비", "권수비"],
    caution: "전류비는 전압비와 반대 방향이다.",
    keywords: ["변압기", "권수비", "변압비"],
  },
  {
    id: "machine-sync-speed",
    subjectCode: "electric-machines",
    kind: "formula",
    title: "동기속도",
    prompt: "주파수 f, 극수 P인 회전기의 동기속도는?",
    content: "Nₛ = 120f / P",
    canonicalKey: "Ns=120f/P",
    aliases: ["동기 회전수"],
    units: "rpm",
    keywords: ["동기속도", "극수", "주파수"],
  },
  {
    id: "power-loss",
    subjectCode: "power-engineering",
    kind: "formula",
    title: "선로 전력손실",
    prompt: "선로 저항 R에 전류 I가 흐를 때 손실은?",
    content: "Pₗ = I²R",
    canonicalKey: "Pl=I^2R",
    aliases: ["동손", "줄손"],
    caution: "전류를 절반으로 낮추면 손실은 1/4이 된다.",
    keywords: ["전력손실", "손실을 감소", "선로손실"],
  },
  {
    id: "power-grounding",
    subjectCode: "power-engineering",
    kind: "theory",
    title: "중성점 접지방식과 이상전압",
    prompt: "이상전압 억제에 가장 유리한 중성점 접지방식은?",
    content: "직접접지는 지락 시 건전상의 대지전압 상승이 작다.",
    canonicalKey: "direct-grounding-overvoltage",
    aliases: ["직접접지", "유효접지"],
    caution: "지락전류가 커지는 단점과 함께 기억한다.",
    keywords: ["이상전압", "중성점 접지", "직접접지"],
  },
  {
    id: "circuit-ohm",
    subjectCode: "circuit-theory",
    kind: "formula",
    title: "옴의 법칙",
    prompt: "전압·전류·저항의 기본 관계는?",
    content: "V = IR",
    canonicalKey: "V=IR",
    aliases: ["I=V/R", "R=V/I"],
    units: "V, A, Ω",
    keywords: ["옴의 법칙", "저항", "전류"],
  },
  {
    id: "circuit-kirchhoff",
    subjectCode: "circuit-theory",
    kind: "theory",
    title: "키르히호프 법칙",
    prompt: "노드와 폐회로에서 보존되는 양은?",
    content: "노드 전류의 대수합은 0, 폐회로 전압의 대수합은 0이다.",
    canonicalKey: "KCL-KVL",
    aliases: ["KCL", "KVL"],
    keywords: ["키르히호프", "노드", "폐회로"],
  },
  {
    id: "regulation-ground-potential",
    subjectCode: "electrical-regulations",
    kind: "theory",
    title: "접지의 기준 전위",
    prompt: "대지를 접지의 기준으로 사용하는 이유는?",
    content: "지구의 정전용량이 매우 커 전하가 출입해도 전위 변화가 거의 없다.",
    canonicalKey: "earth-reference-potential",
    aliases: ["대지전위", "영전위"],
    keywords: ["접지", "지구의 정전용량", "대지"],
  },
  {
    id: "regulation-overcurrent",
    subjectCode: "electrical-regulations",
    kind: "theory",
    title: "과전류 보호장치",
    prompt: "과부하와 단락으로부터 전로를 보호하는 기본 원칙은?",
    content: "허용전류와 예상 단락전류에 맞는 차단기 또는 퓨즈를 선정한다.",
    canonicalKey: "overcurrent-protection",
    aliases: ["배선차단기", "과부하보호장치"],
    keywords: ["과전류", "배선차단기", "과부하보호"],
  },
];

export function inferStudyItemIds(text: string): string[] {
  const compact = text.replace(/\s+/g, " ").toLowerCase();
  return STUDY_CATALOG.filter((item) =>
    item.keywords.some((keyword) => compact.includes(keyword.toLowerCase())),
  ).map((item) => item.id);
}
