import { describe, expect, it } from 'vitest';
import { svgUnit } from '../svgUnit';

describe('svgUnit', () => {
  it('colapsa a divergência de ulp entre o V8 do servidor e o do browser', () => {
    // Os dois valores reais do hydration mismatch do SwellRadar: o mesmo
    // ponto, calculado com o mesmo cos, difere no 17.º dígito conforme o
    // runtime. Depois de arredondar, o atributo é byte-a-byte igual.
    const doServidor = 19.122649247653435;
    const doCliente = 19.122649247653428;
    expect(doServidor).not.toBe(doCliente);
    expect(svgUnit(doServidor)).toBe(svgUnit(doCliente));
    expect(String(svgUnit(doServidor))).toBe(String(svgUnit(doCliente)));
  });

  it('mantém duas casas decimais — precisão muito abaixo de um pixel', () => {
    expect(svgUnit(33.58235591016396)).toBe(33.58);
    expect(svgUnit(48.9333074563815)).toBe(48.93);
    expect(svgUnit(55.24106688663701)).toBe(55.24);
  });

  it('não introduz -0 nem casas decimais em inteiros', () => {
    // `-0` serializaria como "-0" no atributo e voltaria a divergir de "0".
    expect(Object.is(svgUnit(-0.001), 0)).toBe(true);
    expect(svgUnit(72)).toBe(72);
    expect(String(svgUnit(72))).toBe('72');
  });
});
