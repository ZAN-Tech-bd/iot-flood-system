import { $, setText } from '../lib/dom.js';

export function initLocationPicker() {
  let selectedLocation = null,
    locations = [],
    countryCities = [],
    searchVersion = 0;
  const cityCache = new Map();
  const codes =
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
      ' ',
    );
  const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
  codes
    .map((code) => ({ code, name: countryNames.of(code) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(({ code, name }) => $('country').add(new Option(name, code)));

  function renderCities(cities) {
    locations = [...cities];
    let selectedIndex = -1;
    if (selectedLocation) {
      selectedIndex = locations.findIndex(
        (p) =>
          p.city === selectedLocation.city &&
          p.lat === selectedLocation.lat &&
          p.lon === selectedLocation.lon,
      );
      if (selectedIndex === -1) {
        locations.unshift(selectedLocation);
        selectedIndex = 0;
      }
    }
    const options = [new Option('Select a city', '')];
    locations.forEach((p, index) =>
      options.push(new Option(`${p.city}${p.region ? ', ' + p.region : ''}`, String(index))),
    );
    $('city').replaceChildren(...options);
    $('city').value = selectedIndex === -1 ? '' : String(selectedIndex);
  }
  async function loadCountryCities(savedLocation = null) {
    const version = ++searchVersion,
      country = $('country').value;
    selectedLocation = savedLocation;
    countryCities = [];
    renderCities([]);
    $('city').disabled = true;
    $('citySearch').disabled = true;
    $('searchCities').disabled = true;
    setText('cityStatus', 'Loading cities…');
    try {
      let cities = cityCache.get(country);
      if (!cities) {
        const response = await fetch(`/api/cities?country=${encodeURIComponent(country)}`);
        cities = await response.json();
        if (!response.ok) throw new Error(cities.error);
        cityCache.set(country, cities);
      }
      if (version !== searchVersion) return;
      countryCities = cities;
      filterCities();
    } catch (error) {
      if (version === searchVersion)
        setText(
          'cityStatus',
          `${error.message} Try selecting the country again or use online search.`,
        );
    } finally {
      if (version === searchVersion) {
        $('city').disabled = false;
        $('citySearch').disabled = false;
        $('searchCities').disabled = false;
      }
    }
  }
  const normalizeCity = (value) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  function filterCities() {
    const query = normalizeCity($('citySearch').value.trim());
    const matches = countryCities.filter((p) =>
      normalizeCity(`${p.city} ${p.region}`).includes(query),
    );
    renderCities(matches);
    setText(
      'cityStatus',
      countryCities.length
        ? `${matches.length} of ${countryCities.length} directory cities shown. Choose a city, or search online for other places.`
        : 'No directory cities for this country. Search online by city name.',
    );
  }
  $('country').addEventListener('change', () => {
    $('citySearch').value = '';
    void loadCountryCities();
  });
  $('citySearch').addEventListener('input', () => {
    searchVersion++;
    $('city').disabled = false;
    $('searchCities').disabled = false;
    filterCities();
  });
  $('citySearch').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('searchCities').click();
    }
  });
  $('searchCities').addEventListener('click', async () => {
    const version = ++searchVersion;
    const query = $('citySearch').value.trim(),
      country = $('country').value;
    if (query.length < 2) return setText('cityStatus', 'Enter at least two city letters.');
    $('searchCities').disabled = true;
    setText('cityStatus', 'Searching cities…');
    try {
      const response = await fetch(
        `/api/locations?q=${encodeURIComponent(query)}&country=${country}`,
      );
      const result = await response.json();
      if (version !== searchVersion) return;
      if (!response.ok) throw new Error(result.error);
      renderCities(result);
      setText(
        'cityStatus',
        result.length
          ? `${result.length} online matches. Select your city.`
          : 'No online matches. Clear the filter to browse the country directory.',
      );
    } catch (error) {
      if (version === searchVersion) setText('cityStatus', error.message);
    } finally {
      if (version === searchVersion) $('searchCities').disabled = false;
    }
  });
  $('city').addEventListener('change', () => {
    selectedLocation = $('city').value === '' ? null : locations[Number($('city').value)];
  });

  return {
    getSelection: () => selectedLocation,
    setLocation(location) {
      $('country').value = location.countryCode;
      $('citySearch').value = '';
      void loadCountryCities(location);
    },
  };
}
