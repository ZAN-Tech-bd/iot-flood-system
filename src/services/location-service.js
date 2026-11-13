import { City, Country, State } from 'country-state-city';
import { httpGet } from './http-client.js';
const cityDirectory = new Map();
export function listCities(code) {
  const country = /^[A-Z]{2}$/.test(code) && Country.getCountryByCode(code);
  if (!country) throw new Error('Choose a valid country.');
  if (!cityDirectory.has(code)) {
    const regions = new Map(
      State.getStatesOfCountry(code).map((state) => [state.isoCode, state.name]),
    );
    const cities = (City.getCitiesOfCountry(code) || [])
      .filter(
        (city) =>
          city.latitude &&
          city.longitude &&
          Number.isFinite(Number(city.latitude)) &&
          Number.isFinite(Number(city.longitude)),
      )
      .map((city) => ({
        city: city.name,
        region: regions.get(city.stateCode) || '',
        country: country.name,
        countryCode: code,
        lat: Number(city.latitude),
        lon: Number(city.longitude),
      }))
      .sort((a, b) => a.city.localeCompare(b.city) || a.region.localeCompare(b.region));
    cityDirectory.set(code, cities);
  }
  return cityDirectory.get(code);
}

export async function searchLocations(query, country, get = httpGet) {
  if (
    typeof query !== 'string' ||
    query.trim().length < 2 ||
    query.length > 100 ||
    !/^[A-Z]{2}$/.test(country)
  )
    throw new Error('Choose a country and enter at least two city letters.');
  const { data } = await get('https://geocoding-api.open-meteo.com/v1/search', {
    name: query.trim(),
    count: 100,
    language: 'en',
    countryCode: country,
  });
  return (data.results || [])
    .filter((p) => p.country_code === country)
    .map((p) => ({
      id: p.id,
      city: p.name,
      region: p.admin1 || '',
      country: p.country,
      countryCode: p.country_code,
      lat: p.latitude,
      lon: p.longitude,
    }));
}
