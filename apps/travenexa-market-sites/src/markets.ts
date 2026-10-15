export type MarketKey = 'kr' | 'jp' | 'cn' | 'us';
export type ProductKey = 'airport' | 'hotels' | 'local' | 'rail' | 'experiences';

export type SiteCopy = {
  marketLine: string;
  headline: string;
  introduction: string;
  heroTag: string;
  marketCountry: string;
  ukDestination: string;
  planTrip: string;
  services: string;
  howItWorks: string;
  support: string;
  chooseService: string;
  searchTitle: string;
  searchSub: string;
  airport: string;
  hotels: string;
  local: string;
  rail: string;
  experiences: string;
  airportHelp: string;
  hotelsHelp: string;
  localHelp: string;
  railHelp: string;
  experiencesHelp: string;
  origin: string;
  destination: string;
  arrivalAirport: string;
  accommodation: string;
  city: string;
  date: string;
  time: string;
  guests: string;
  nights: string;
  flightNumber: string;
  getOptions: string;
  searching: string;
  availabilityNotice: string;
  sourceNotice: string;
  cannotBook: string;
  connectionError: string;
  results: string;
  details: string;
  moreToExplore: string;
  trust1: string;
  trust2: string;
  trust3: string;
  processTitle: string;
  processOneTitle: string;
  processOne: string;
  processTwoTitle: string;
  processTwo: string;
  processThreeTitle: string;
  processThree: string;
  helpTitle: string;
  helpText: string;
  helpNote: string;
  footer: string;
  previewTag: string;
};

export type MarketConfig = {
  id: MarketKey;
  sourceCountry: 'KR' | 'JP' | 'CN' | 'US';
  targetCountry: 'GB';
  locale: string;
  displayCurrency: 'KRW' | 'JPY' | 'CNY' | 'USD';
  flag: string;
  brandName: string;
  marketName: string;
  copy: SiteCopy;
};

const ko: SiteCopy = {
  marketLine:'한국에서 영국으로',headline:'영국 여행, 출발 전에 더 편리하게.',introduction:'공항 픽업부터 영국 호텔, 현지 차량, 기차, 특별한 체험까지 한곳에서 계획해 보세요.',
  heroTag:'한국 여행자를 위한 영국 여행 서비스',marketCountry:'대한민국',ukDestination:'영국',planTrip:'여행 계획',services:'서비스',howItWorks:'이용 방법',support:'도움말',chooseService:'서비스 선택',searchTitle:'영국 여행을 계획하세요',
  searchSub:'도착 예정 정보를 입력하면 제휴사 연결이 활성화된 서비스만 안내합니다.',airport:'공항 픽업',hotels:'호텔',local:'현지 차량',rail:'기차 · 버스',experiences:'관광 · 체험',
  airportHelp:'영국 공항에서 숙소까지',hotelsHelp:'영국의 숙박 시설',localHelp:'도시간 이동과 전용 차량',railHelp:'열차와 장거리 버스',experiencesHelp:'명소 입장권과 투어',
  origin:'출발지',destination:'도착지',arrivalAirport:'도착 공항',accommodation:'호텔 / 도시',city:'도시',date:'날짜',time:'시간',guests:'인원',nights:'숙박 일수',flightNumber:'항공편 (선택)',
  getOptions:'이용 가능 여부 확인',searching:'조회 중…',availabilityNotice:'현재 제휴사의 실시간 예약 서비스는 준비 중입니다. 예약 가능 여부가 확인되지 않았습니다.',
  sourceNotice:'표시 통화는 가격 제안용이며 실제 결제 통화와 환율은 결제 시 별도 확인됩니다.',cannotBook:'실시간 예약이 아직 활성화되지 않았습니다. 확정된 가격이나 예약은 제공하지 않습니다.',
  connectionError:'서비스 정보를 불러올 수 없습니다. 예약이나 결제는 진행되지 않았습니다.',results:'제휴사 검색 결과',details:'상세 정보',moreToExplore:'영국에서 더 많은 경험을',
  trust1:'영국 여행에 집중',trust2:'한국어로 안내',trust3:'확인된 제휴사만 예약',processTitle:'간단한 여행 준비',processOneTitle:'여행 일정 선택',processOne:'공항과 날짜, 이동 목적지를 선택하세요.',
  processTwoTitle:'제휴사 확인',processTwo:'실시간 공급자 연결이 검증되면 옵션을 표시합니다.',processThreeTitle:'안전하게 예약',processThree:'예약 가능할 때만 명확한 조건과 함께 결제합니다.',
  helpTitle:'현지 지원이 필요하신가요?',helpText:'도착 시간, 이동 동선, 영국 관광에 관한 문의를 관리할 수 있도록 준비 중입니다.',helpNote:'지원 채널 연결 전에는 응답을 보장하지 않습니다.',footer:'TraveNexa의 여행 기술 기반',previewTag:'사전 출시 미리보기'
};
const ja: SiteCopy = {
  marketLine:'日本から英国へ',headline:'英国旅行を、出発前からもっとスムーズに。',introduction:'空港送迎、英国ホテル、現地の専用車、鉄道、観光体験をひとつの旅程で検討できます。',
  heroTag:'日本の旅行者のための英国旅行',marketCountry:'日本',ukDestination:'英国',planTrip:'旅を計画',services:'サービス',howItWorks:'使い方',support:'サポート',chooseService:'サービスを選択',searchTitle:'英国での移動や滞在を探す',
  searchSub:'日程を入力すると、承認・接続済みの提携サービスのみをご案内します。',airport:'空港送迎',hotels:'ホテル',local:'専用車・送迎',rail:'鉄道・バス',experiences:'観光・体験',
  airportHelp:'空港からホテルへ',hotelsHelp:'英国各地の宿泊施設',localHelp:'都市間や市内の移動',railHelp:'鉄道と長距離バス',experiencesHelp:'名所、チケット、ツアー',
  origin:'出発地',destination:'目的地',arrivalAirport:'到着空港',accommodation:'宿泊地・都市',city:'都市',date:'日付',time:'時刻',guests:'人数',nights:'泊数',flightNumber:'便名（任意）',
  getOptions:'空き状況を確認',searching:'確認中…',availabilityNotice:'提携先とのリアルタイム予約連携は準備中です。予約の可否は確認されていません。',
  sourceNotice:'表示通貨は参考用です。決済通貨・換算レートはチェックアウト時に表示します。',cannotBook:'現在、実際の予約・支払いは受け付けていません。確定料金は表示しません。',
  connectionError:'サービスの応答を取得できません。予約や決済は行われていません。',results:'連携先の検索結果',details:'詳細',moreToExplore:'英国でもっと楽しむ',
  trust1:'英国の旅行に特化',trust2:'日本語に対応',trust3:'確認済みの提携先のみ',processTitle:'ご利用の流れ',processOneTitle:'旅程を入力',processOne:'到着空港、日付、目的地を選択します。',
  processTwoTitle:'連携先を確認',processTwo:'供給元の接続確認後に利用可能な選択肢を表示します。',processThreeTitle:'条件を確認して予約',processThree:'予約が可能になってから、料金と条件をご確認ください。',
  helpTitle:'英国での移動をサポート',helpText:'到着便、送迎、観光プランなどの問い合わせ機能を準備中です。',helpNote:'サポート窓口は現在準備中で、返信を保証するものではありません。',footer:'旅行システムはTraveNexaを利用',previewTag:'公開前プレビュー'
};
const zh: SiteCopy = {
  marketLine:'从中国出发，畅游英国',headline:'英国之旅，出发前一站式安排。',introduction:'从机场接送到英国酒店、包车、火车巴士及景点体验，轻松规划您的英国行程。',
  heroTag:'专为中国赴英游客打造',marketCountry:'中国',ukDestination:'英国',planTrip:'规划行程',services:'旅游服务',howItWorks:'使用流程',support:'服务支持',chooseService:'选择服务',searchTitle:'安排您的英国之行',
  searchSub:'输入出行信息，仅在供应商接入并通过验证后显示可预订选项。',airport:'机场接送',hotels:'英国酒店',local:'本地包车',rail:'火车与巴士',experiences:'景点与体验',
  airportHelp:'从机场直达酒店',hotelsHelp:'英国各地住宿',localHelp:'市内与城际用车',railHelp:'铁路和长途巴士',experiencesHelp:'景区门票与导览',
  origin:'出发地点',destination:'目的地',arrivalAirport:'抵达机场',accommodation:'酒店 / 城市',city:'城市',date:'日期',time:'时间',guests:'人数',nights:'入住晚数',flightNumber:'航班号（选填）',
  getOptions:'查询可订服务',searching:'正在查询…',availabilityNotice:'供应商实时预订接口尚未开通，当前无法确认预订或价格。',
  sourceNotice:'展示货币仅供参考；实际结算货币与汇率将在支付前明确显示。',cannotBook:'实时预订尚未开放，不会提供虚假报价或确认订单。',
  connectionError:'供应商暂时未响应，本次未完成预订或支付。',results:'供应商查询结果',details:'详情',moreToExplore:'发现更多英国体验',
  trust1:'专注英国旅游',trust2:'简体中文界面',trust3:'仅展示已验证供应商',processTitle:'轻松三步',processOneTitle:'填写出行计划',processOne:'选择机场、日期及目的地。',
  processTwoTitle:'核验供应商',processTwo:'仅对通过审核的实时连接展示服务。',processThreeTitle:'确认条款后付款',processThree:'待预订开放后再确认价格和付款。',
  helpTitle:'需要英国本地协助？',helpText:'正在筹备接机、酒店及英国活动的多语言客服功能。',helpNote:'客服渠道尚未启用，请勿将本页面视为24小时服务承诺。',footer:'由TraveNexa提供旅游技术支持',previewTag:'上线前预览'
};
const en: SiteCopy = {
  marketLine:'From the USA to the United Kingdom',headline:'The best of Britain, organised before you land.',introduction:'Plan your airport pickup, UK hotel, private journeys, rail trips and unforgettable experiences in one place.',
  heroTag:'UK journeys, made for American travellers',marketCountry:'United States',ukDestination:'United Kingdom',planTrip:'Plan your trip',services:'What we offer',howItWorks:'How it works',support:'Support',chooseService:'Choose a service',searchTitle:'Start planning your UK visit',
  searchSub:'Enter your journey details. We only show live bookable options when verified supplier connections are enabled.',airport:'Airport transfers',hotels:'UK hotels',local:'Private transport',rail:'Trains & coaches',experiences:'Experiences',
  airportHelp:'A smooth welcome from your airport',hotelsHelp:'Stay across Britain',localHelp:'Private rides and city-to-city trips',railHelp:'Explore by train or coach',experiencesHelp:'Tickets, attractions and tours',
  origin:'From',destination:'To',arrivalAirport:'Arrival airport',accommodation:'Hotel / destination city',city:'City',date:'Travel date',time:'Local arrival time',guests:'Travellers',nights:'Nights',flightNumber:'Flight number (optional)',
  getOptions:'Check availability',searching:'Checking…',availabilityNotice:'Live supplier bookings are being prepared. No real-time availability or confirmed fares are currently available.',
  sourceNotice:'Display currency is indicative. Any payment currency and FX terms will be shown before checkout.',cannotBook:'Real-time reservations have not been activated yet. No bookings or payments are being taken.',
  connectionError:'We could not reach the supplier service. No reservation or payment has been made.',results:'Verified supplier results',details:'View details',moreToExplore:'Discover more of the UK',
  trust1:'UK travel specialists',trust2:'Simple English-language booking',trust3:'Only verified suppliers can book',processTitle:'Arrive with a plan',processOneTitle:'Tell us your plans',processOne:'Choose your arrival airport, dates and destination.',
  processTwoTitle:'Compare trusted options',processTwo:'Live results appear only after suppliers are approved and connected.',processThreeTitle:'Book with confidence',processThree:'Review full prices, terms and operator details before a reservation.',
  helpTitle:'Need a hand planning your visit?',helpText:'We are preparing assistance for airport arrivals, onward travel and local experiences.',helpNote:'Support channels are not connected yet; live response times are not promised.',footer:'Travel technology by TraveNexa',previewTag:'Pre-launch preview'
};

export const markets: Record<MarketKey, MarketConfig> = {
  kr:{id:'kr',sourceCountry:'KR',targetCountry:'GB',locale:'ko-KR',displayCurrency:'KRW',flag:'🇰🇷',brandName:'UK Travel Korea',marketName:'South Korea',copy:ko},
  jp:{id:'jp',sourceCountry:'JP',targetCountry:'GB',locale:'ja-JP',displayCurrency:'JPY',flag:'🇯🇵',brandName:'UK Travel Japan',marketName:'Japan',copy:ja},
  cn:{id:'cn',sourceCountry:'CN',targetCountry:'GB',locale:'zh-CN',displayCurrency:'CNY',flag:'🇨🇳',brandName:'UK Travel China',marketName:'China',copy:zh},
  us:{id:'us',sourceCountry:'US',targetCountry:'GB',locale:'en-US',displayCurrency:'USD',flag:'🇺🇸',brandName:'UK Travel USA',marketName:'United States',copy:en},
};

export const productKeys: readonly ProductKey[] = ['airport','hotels','local','rail','experiences'];
export const airports = [
  {code:'LHR',name:'London Heathrow'},
  {code:'LGW',name:'London Gatwick'},
  {code:'STN',name:'London Stansted'},
  {code:'LTN',name:'London Luton'},
  {code:'MAN',name:'Manchester'},
  {code:'BHX',name:'Birmingham'},
  {code:'EDI',name:'Edinburgh'},
  {code:'BRS',name:'Bristol'},
] as const;
export const cities = ['London','Manchester','Edinburgh','Oxford','Cambridge','Birmingham','Bath','York','Liverpool','Bristol','Luton','Cardiff','Glasgow'] as const;

export function getMarket(value: unknown): MarketConfig {
  return typeof value === 'string' && Object.hasOwn(markets,value) ? markets[value as MarketKey] : markets.us;
}
export function fromDocument(): MarketConfig {
  return getMarket(document.documentElement.dataset.market);
}
