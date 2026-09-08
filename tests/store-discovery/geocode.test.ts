import { describe, expect, it } from "vitest";
import { extractCoordinates, extractDistricts } from "../../src/store-discovery/pyaterochka/geocode.js";

const response = {
  response: {
    GeoObjectCollection: {
      featureMember: [
        { GeoObject: { Point: { pos: "30.468115 59.851209" } } },
        {
          GeoObject: {
            metaDataProperty: {
              GeocoderMetaData: {
                Address: {
                  Components: [
                    { kind: "district", name: "исторический район Троицкое Поле" },
                    { kind: "district", name: "Невский район" },
                    { kind: "district", name: "муниципальный округ Обуховский" },
                  ],
                },
              },
            },
          },
        },
      ],
    },
  },
};

describe("pyaterochka geocode parser", () => {
  it("извлекает координаты", () => {
    expect(extractCoordinates(response)).toEqual({ longitude: 30.468115, latitude: 59.851209 });
  });

  it("отделяет административный район от муниципального", () => {
    expect(extractDistricts(response)).toEqual({
      administrativeDistrict: "Невский район",
      municipalDistrict: "муниципальный округ Обуховский",
    });
  });
});
