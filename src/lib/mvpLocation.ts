/**
 * MVP：出发地固定为望京 SOHO，便于联调与演示（后续可接真实定位）
 */
export const MVP_WANGJING_SOHO_LAT = 39.9967;
export const MVP_WANGJING_SOHO_LON = 116.4808;

export const MVP_WANGJING_SOHO_ADDRESS =
  "北京市朝阳区望京 SOHO（MVP 固定演示点）";

export const MVP_DEPARTURE_LOCATION = {
  lat: MVP_WANGJING_SOHO_LAT,
  lon: MVP_WANGJING_SOHO_LON,
  address: MVP_WANGJING_SOHO_ADDRESS,
} as const;
