// TraveNexa is the sole travel-domain landlord. Catalogue entries are NOT live connections.
// Market storefronts and brands are tenants, never independent supplier credential owners.
export const PRODUCT_TYPES = Object.freeze([
  'flights', 'hotels', 'rail', 'coach', 'chauffeur', 'transfers',
  'car_hire', 'activities', 'ferries', 'esim', 'third_party_packages',
]);
export const PRODUCT_ALIASES = Object.freeze({
  airport: 'transfers', local: 'chauffeur', experiences: 'activities',
});
const tenant = (id, name, products, options = {}) => Object.freeze({
  id, name, products: Object.freeze(products), ...options,
});
const inbound = ['transfers','hotels','chauffeur','rail','coach','activities'];
export const TENANTS = Object.freeze({
  'travenexa-flightlounge': tenant('travenexa-flightlounge','FlightLounge',['flights','hotels','transfers']),
  'travenexa-marocways': tenant('travenexa-marocways','MarocWays',
    ['flights','hotels','rail','coach','chauffeur','transfers','car_hire','activities','ferries','esim']),
  'travenexa-bestfares': tenant('travenexa-bestfares','BestFares BestRates',
    ['flights','hotels','rail','coach','car_hire','activities']),
  // Route50 geography and service offering have not been verified; products are deliberately off.
  'travenexa-route50': tenant('travenexa-route50','Route50',[]),
  'travenexa.uk-inbound.kr': tenant('travenexa.uk-inbound.kr','Korea to UK',inbound,{sourceMarket:'KR',destinationCountry:'GB',locale:'ko-KR',displayCurrency:'KRW'}),
  'travenexa.uk-inbound.jp': tenant('travenexa.uk-inbound.jp','Japan to UK',inbound,{sourceMarket:'JP',destinationCountry:'GB',locale:'ja-JP',displayCurrency:'JPY'}),
  'travenexa.uk-inbound.cn': tenant('travenexa.uk-inbound.cn','China to UK',inbound,{sourceMarket:'CN',destinationCountry:'GB',locale:'zh-CN',displayCurrency:'CNY'}),
  'travenexa.uk-inbound.us': tenant('travenexa.uk-inbound.us','US to UK',inbound,{sourceMarket:'US',destinationCountry:'GB',locale:'en-US',displayCurrency:'USD'}),
  // Agency / platform provisioning must be explicit, not provisioned by a code catalogue.
  'travenexa-white-label': tenant('travenexa-white-label','Agency template',[]),
});
export const INBOUND_MARKETS = Object.freeze({
  KR:'travenexa.uk-inbound.kr', JP:'travenexa.uk-inbound.jp',
  CN:'travenexa.uk-inbound.cn', US:'travenexa.uk-inbound.us',
});
// Registered integration targets only. No invented credentials, endpoints, commissions or availability.
const supplier = (id, name, products) => Object.freeze({id,name,products:Object.freeze(products),status:'catalogue_only'});
export const SUPPLIERS = Object.freeze([
  supplier('mystifly','Mystifly',['flights']),
  supplier('travelfusion','Travelfusion',['flights','rail']),
  supplier('pkfare','PKFARE',['flights']),
  supplier('hotelbeds','Hotelbeds / HBX Group',['hotels']),
  supplier('tbo','TBO',['hotels']),
  supplier('agoda','Agoda',['hotels']),
  supplier('omio','Omio',['rail','coach','flights']),
  supplier('distribusion','Distribusion',['coach']),
  supplier('busbud','Busbud',['coach']),
  supplier('mozio','Mozio',['transfers','chauffeur']),
  supplier('blacklane','Blacklane',['chauffeur','transfers']),
  supplier('cartrawler','CarTrawler',['car_hire']),
  supplier('discovercars','DiscoverCars',['car_hire']),
  supplier('viator','Viator',['activities']),
  supplier('tui-musement','TUI Musement',['activities']),
  supplier('getyourguide','GetYourGuide',['activities']),
  supplier('direct-ferries','Direct Ferries',['ferries']),
  supplier('airalo','Airalo',['esim']),
  // An actual authorised organiser must own every package contract.
  supplier('licensed-package-organiser','Authorised third-party organiser',['third_party_packages']),
]);
export const SUPPLIER_BY_ID = Object.freeze(Object.fromEntries(SUPPLIERS.map(item=>[item.id,item])));
