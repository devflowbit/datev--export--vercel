/**
 * VAT Validation Service
 * Algorithmic check digit validation for European VAT numbers
 * 
 * Based on the comprehensive VAT validation algorithm by John Gardner
 * http://www.braemoor.co.uk/software/vat.shtml (V1.29)
 * 
 * Supports: AT, BE, BG, CHE, CY, CZ, DE, DK, EE, EL, ES, EU, FI, FR, GB, HR, HU, 
 *           IE, IT, LT, LU, LV, MT, NL, NO, PL, PT, RO, RS, RU, SE, SI, SK
 */

export class VATValidationService {

  /**
   * Main validation entry point
   * Returns true if VAT number is valid, false otherwise
   */
  static validateVATNumber(toCheck: string): boolean {
    if (!toCheck) return false;

    // Regular expressions for valid VAT number formats
    const vatexp: RegExp[] = [
      /^(AT)U(\d{8})$/,                           // Austria
      /^(BE)(0?\d{9})$/,                          // Belgium 
      /^(BG)(\d{9,10})$/,                         // Bulgaria 
      /^(CHE)(\d{9})(MWST|TVA|IVA)?$/,            // Switzerland
      /^(CY)([0-59]\d{7}[A-Z])$/,                 // Cyprus
      /^(CZ)(\d{8,10})(\d{3})?$/,                 // Czech Republic
      /^(DE)([1-9]\d{8})$/,                       // Germany 
      /^(DK)(\d{8})$/,                            // Denmark 
      /^(EE)(10\d{7})$/,                          // Estonia 
      /^(EL)(\d{9})$/,                            // Greece 
      /^(ES)([A-Z]\d{8})$/,                       // Spain (National juridical entities)
      /^(ES)([A-HN-SW]\d{7}[A-J])$/,              // Spain (Other juridical entities)
      /^(ES)([0-9YZ]\d{7}[A-Z])$/,                // Spain (Personal entities type 1)
      /^(ES)([KLMX]\d{7}[A-Z])$/,                 // Spain (Personal entities type 2)
      /^(EU)(\d{9})$/,                            // EU-type 
      /^(FI)(\d{8})$/,                            // Finland 
      /^(FR)(\d{11})$/,                           // France (1)
      /^(FR)([A-HJ-NP-Z]\d{10})$/,                // France (2)
      /^(FR)(\d[A-HJ-NP-Z]\d{9})$/,               // France (3)
      /^(FR)([A-HJ-NP-Z]{2}\d{9})$/,              // France (4)
      /^(GB)(\d{9})$/,                            // UK (Standard)
      /^(GB)(\d{12})$/,                           // UK (Branches)
      /^(GB)(GD\d{3})$/,                          // UK (Government)
      /^(GB)(HA\d{3})$/,                          // UK (Health authority)
      /^(HR)(\d{11})$/,                           // Croatia 
      /^(HU)(\d{8})$/,                            // Hungary 
      /^(IE)(\d{7}[A-W])$/,                       // Ireland (1)
      /^(IE)([7-9][A-Z\*\+)]\d{5}[A-W])$/,        // Ireland (2)
      /^(IE)(\d{7}[A-W][AH])$/,                   // Ireland (3)
      /^(IT)(\d{11})$/,                           // Italy 
      /^(LV)(\d{11})$/,                           // Latvia 
      /^(LT)(\d{9}|\d{12})$/,                     // Lithuania
      /^(LU)(\d{8})$/,                            // Luxembourg 
      /^(MT)([1-9]\d{7})$/,                       // Malta
      /^(NL)(\d{9})B\d{2}$/,                      // Netherlands
      /^(NO)(\d{9})$/,                            // Norway (not EU)
      /^(PL)(\d{10})$/,                           // Poland
      /^(PT)(\d{9})$/,                            // Portugal
      /^(RO)([1-9]\d{1,9})$/,                     // Romania
      /^(RU)(\d{10}|\d{12})$/,                    // Russia
      /^(RS)(\d{9})$/,                            // Serbia
      /^(SI)([1-9]\d{7})$/,                       // Slovenia
      /^(SK)([1-9]\d[2346-9]\d{7})$/,             // Slovakia Republic
      /^(SE)(\d{10}01)$/,                         // Sweden
    ];

    // Normalize VAT number
    let VATNumber = toCheck.toUpperCase();
    VATNumber = VATNumber.replace(/(\s|-|\.)+/g, '');

    // Check against all patterns
    for (const regex of vatexp) {
      const match = VATNumber.match(regex);
      if (match) {
        const cCode = match[1];
        const cNumber = match[2];

        // Call country-specific validation
        return this.validateByCountry(cCode, cNumber);
      }
    }

    return false;
  }

  /**
   * Route to country-specific check digit validation
   */
  private static validateByCountry(countryCode: string, vatNumber: string): boolean {
    switch (countryCode) {
      case 'AT': return this.ATVATCheckDigit(vatNumber);
      case 'BE': return this.BEVATCheckDigit(vatNumber);
      case 'BG': return this.BGVATCheckDigit(vatNumber);
      case 'CHE': return this.CHEVATCheckDigit(vatNumber);
      case 'CY': return this.CYVATCheckDigit(vatNumber);
      case 'CZ': return this.CZVATCheckDigit(vatNumber);
      case 'DE': return this.DEVATCheckDigit(vatNumber);
      case 'DK': return this.DKVATCheckDigit(vatNumber);
      case 'EE': return this.EEVATCheckDigit(vatNumber);
      case 'EL': return this.ELVATCheckDigit(vatNumber);
      case 'ES': return this.ESVATCheckDigit(vatNumber);
      case 'EU': return this.EUVATCheckDigit(vatNumber);
      case 'FI': return this.FIVATCheckDigit(vatNumber);
      case 'FR': return this.FRVATCheckDigit(vatNumber);
      case 'GB': return this.GBVATCheckDigit(vatNumber);
      case 'HR': return this.HRVATCheckDigit(vatNumber);
      case 'HU': return this.HUVATCheckDigit(vatNumber);
      case 'IE': return this.IEVATCheckDigit(vatNumber);
      case 'IT': return this.ITVATCheckDigit(vatNumber);
      case 'LT': return this.LTVATCheckDigit(vatNumber);
      case 'LU': return this.LUVATCheckDigit(vatNumber);
      case 'LV': return this.LVVATCheckDigit(vatNumber);
      case 'MT': return this.MTVATCheckDigit(vatNumber);
      case 'NL': return this.NLVATCheckDigit(vatNumber);
      case 'NO': return this.NOVATCheckDigit(vatNumber);
      case 'PL': return this.PLVATCheckDigit(vatNumber);
      case 'PT': return this.PTVATCheckDigit(vatNumber);
      case 'RO': return this.ROVATCheckDigit(vatNumber);
      case 'RS': return this.RSVATCheckDigit(vatNumber);
      case 'RU': return this.RUVATCheckDigit(vatNumber);
      case 'SE': return this.SEVATCheckDigit(vatNumber);
      case 'SI': return this.SIVATCheckDigit(vatNumber);
      case 'SK': return this.SKVATCheckDigit(vatNumber);
      default: return false;
    }
  }

  // ============================================================
  // Country-specific check digit algorithms
  // ============================================================

  /** Austria - ATU + 8 digits */
  private static ATVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [1, 2, 1, 2, 1, 2, 1];
    let temp = 0;

    for (let i = 0; i < 7; i++) {
      temp = Number(vatnumber.charAt(i)) * multipliers[i];
      if (temp > 9) {
        total += Math.floor(temp / 10) + temp % 10;
      } else {
        total += temp;
      }
    }

    total = 10 - (total + 4) % 10;
    if (total === 10) total = 0;

    return total === Number(vatnumber.slice(7, 8));
  }

  /** Belgium - BE + 10 digits */
  private static BEVATCheckDigit(vatnumber: string): boolean {
    if (vatnumber.length === 9) vatnumber = "0" + vatnumber;
    if (vatnumber.slice(1, 2) === '0') return false;

    return 97 - Number(vatnumber.slice(0, 8)) % 97 === Number(vatnumber.slice(8, 10));
  }

  /** Bulgaria - BG + 9 or 10 digits */
  private static BGVATCheckDigit(vatnumber: string): boolean {
    if (vatnumber.length === 9) {
      // 9 digit legal entities
      let total = 0;
      let temp = 0;

      for (let i = 0; i < 8; i++) {
        temp += Number(vatnumber.charAt(i)) * (i + 1);
      }

      total = temp % 11;
      if (total !== 10) {
        return total === Number(vatnumber.slice(8));
      }

      // Recalculate with different multipliers
      temp = 0;
      for (let i = 0; i < 8; i++) {
        temp += Number(vatnumber.charAt(i)) * (i + 3);
      }

      total = temp % 11;
      if (total === 10) total = 0;
      return total === Number(vatnumber.slice(8));
    }

    // 10 digit - check for physical person
    if (/^\d\d[0-5]\d[0-3]\d\d{4}$/.test(vatnumber)) {
      const month = Number(vatnumber.slice(2, 4));
      if ((month > 0 && month < 13) || (month > 20 && month < 33) || (month > 40 && month < 53)) {
        const multipliers = [2, 4, 8, 5, 10, 9, 7, 3, 6];
        let total = 0;
        for (let i = 0; i < 9; i++) {
          total += Number(vatnumber.charAt(i)) * multipliers[i];
        }
        total = total % 11;
        if (total === 10) total = 0;
        if (total === Number(vatnumber.substr(9, 1))) return true;
      }
    }

    // Check for foreigner
    const multipliers1 = [21, 19, 17, 13, 11, 9, 7, 3, 1];
    let total1 = 0;
    for (let i = 0; i < 9; i++) {
      total1 += Number(vatnumber.charAt(i)) * multipliers1[i];
    }
    if (total1 % 10 === Number(vatnumber.substr(9, 1))) return true;

    // Miscellaneous VAT number
    const multipliers2 = [4, 3, 2, 7, 6, 5, 4, 3, 2];
    let total2 = 0;
    for (let i = 0; i < 9; i++) {
      total2 += Number(vatnumber.charAt(i)) * multipliers2[i];
    }
    total2 = 11 - total2 % 11;
    if (total2 === 10) return false;
    if (total2 === 11) total2 = 0;

    return total2 === Number(vatnumber.substr(9, 1));
  }

  /** Switzerland - CHE + 9 digits */
  private static CHEVATCheckDigit(vatnumber: string): boolean {
    const multipliers = [5, 4, 3, 2, 7, 6, 5, 4];
    let total = 0;

    for (let i = 0; i < 8; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    total = 11 - total % 11;
    if (total === 10) return false;
    if (total === 11) total = 0;

    return total === Number(vatnumber.substr(8, 1));
  }

  /** Cyprus - CY + 8 digits + letter */
  private static CYVATCheckDigit(vatnumber: string): boolean {
    if (Number(vatnumber.slice(0, 2)) === 12) return false;

    let total = 0;
    for (let i = 0; i < 8; i++) {
      let temp = Number(vatnumber.charAt(i));
      if (i % 2 === 0) {
        switch (temp) {
          case 0: temp = 1; break;
          case 1: temp = 0; break;
          case 2: temp = 5; break;
          case 3: temp = 7; break;
          case 4: temp = 9; break;
          default: temp = temp * 2 + 3;
        }
      }
      total += temp;
    }

    total = total % 26;
    const checkChar = String.fromCharCode(total + 65);

    return checkChar === vatnumber.substr(8, 1);
  }

  /** Czech Republic - CZ + 8-10 digits */
  private static CZVATCheckDigit(vatnumber: string): boolean {
    const multipliers = [8, 7, 6, 5, 4, 3, 2];

    // 8 digit legal entities
    if (/^\d{8}$/.test(vatnumber)) {
      let total = 0;
      for (let i = 0; i < 7; i++) {
        total += Number(vatnumber.charAt(i)) * multipliers[i];
      }
      total = 11 - total % 11;
      if (total === 10) total = 0;
      if (total === 11) total = 1;
      return total === Number(vatnumber.slice(7, 8));
    }

    // 9 digit individuals (Standard)
    if (/^[0-5][0-9][0|1|5|6][0-9][0-3][0-9]\d{3}$/.test(vatnumber)) {
      return Number(vatnumber.slice(0, 2)) <= 62;
    }

    // 9 digit individuals (Special Cases)
    if (/^6\d{8}$/.test(vatnumber)) {
      let total = 0;
      for (let i = 0; i < 7; i++) {
        total += Number(vatnumber.charAt(i + 1)) * multipliers[i];
      }
      let a: number;
      if (total % 11 === 0) {
        a = total + 11;
      } else {
        a = Math.ceil(total / 11) * 11;
      }
      const pointer = a - total;
      const lookup = [8, 7, 6, 5, 4, 3, 2, 1, 0, 9, 8];
      return lookup[pointer - 1] === Number(vatnumber.slice(8, 9));
    }

    // 10 digit individuals
    if (/^\d{2}[0-3|5-8][0-9][0-3][0-9]\d{4}$/.test(vatnumber)) {
      const temp = Number(vatnumber.slice(0, 2)) + Number(vatnumber.slice(2, 4)) +
                   Number(vatnumber.slice(4, 6)) + Number(vatnumber.slice(6, 8)) +
                   Number(vatnumber.slice(8));
      return temp % 11 === 0 && Number(vatnumber) % 11 === 0;
    }

    return false;
  }

  /** Germany - DE + 9 digits (ISO 7064 MOD 11-2) */
  private static DEVATCheckDigit(vatnumber: string): boolean {
    let product = 10;
    let sum = 0;
    let checkdigit = 0;

    for (let i = 0; i < 8; i++) {
      sum = (Number(vatnumber.charAt(i)) + product) % 10;
      if (sum === 0) sum = 10;
      product = (2 * sum) % 11;
    }

    if (11 - product === 10) {
      checkdigit = 0;
    } else {
      checkdigit = 11 - product;
    }

    return checkdigit === Number(vatnumber.slice(8, 9));
  }

  /** Denmark - DK + 8 digits */
  private static DKVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [2, 7, 6, 5, 4, 3, 2, 1];

    for (let i = 0; i < 8; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    return total % 11 === 0;
  }

  /** Estonia - EE + 9 digits */
  private static EEVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [3, 7, 1, 3, 7, 1, 3, 7];

    for (let i = 0; i < 8; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    total = 10 - total % 10;
    if (total === 10) total = 0;

    return total === Number(vatnumber.slice(8, 9));
  }

  /** Greece - EL + 9 digits */
  private static ELVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [256, 128, 64, 32, 16, 8, 4, 2];

    let vat = vatnumber;
    if (vat.length === 8) vat = "0" + vat;

    for (let i = 0; i < 8; i++) {
      total += Number(vat.charAt(i)) * multipliers[i];
    }

    total = total % 11;
    if (total > 9) total = 0;

    return total === Number(vat.slice(8, 9));
  }

  /** Spain - ES + various formats */
  private static ESVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    let temp = 0;
    const multipliers = [2, 1, 2, 1, 2, 1, 2];

    // National juridical entities
    if (/^[A-H|J|U|V]\d{8}$/.test(vatnumber)) {
      for (let i = 0; i < 7; i++) {
        temp = Number(vatnumber.charAt(i + 1)) * multipliers[i];
        if (temp > 9) {
          total += Math.floor(temp / 10) + temp % 10;
        } else {
          total += temp;
        }
      }
      total = 10 - total % 10;
      if (total === 10) total = 0;
      return total === Number(vatnumber.slice(8, 9));
    }

    // Other juridical entities
    if (/^[A-H|N-S|W]\d{7}[A-J]$/.test(vatnumber)) {
      for (let i = 0; i < 7; i++) {
        temp = Number(vatnumber.charAt(i + 1)) * multipliers[i];
        if (temp > 9) {
          total += Math.floor(temp / 10) + temp % 10;
        } else {
          total += temp;
        }
      }
      total = 10 - total % 10;
      const checkChar = String.fromCharCode(total + 64);
      return checkChar === vatnumber.slice(8, 9);
    }

    // Personal number (NIF) starting with numeric, Y or Z
    if (/^[0-9YZ]\d{7}[A-Z]$/.test(vatnumber)) {
      let tempnumber = vatnumber;
      if (tempnumber.substring(0, 1) === 'Y') tempnumber = tempnumber.replace(/Y/, "1");
      if (tempnumber.substring(0, 1) === 'Z') tempnumber = tempnumber.replace(/Z/, "2");
      return tempnumber.charAt(8) === 'TRWAGMYFPDXBNJZSQVHLCKE'.charAt(Number(tempnumber.substring(0, 8)) % 23);
    }

    // Personal number (NIF) starting with K, L, M, or X
    if (/^[KLMX]\d{7}[A-Z]$/.test(vatnumber)) {
      return vatnumber.charAt(8) === 'TRWAGMYFPDXBNJZSQVHLCKE'.charAt(Number(vatnumber.substring(1, 8)) % 23);
    }

    return false;
  }

  /** EU-type numbers */
  private static EUVATCheckDigit(_vatnumber: string): boolean {
    // EU numbers just need format validation
    return true;
  }

  /** Finland - FI + 8 digits */
  private static FIVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [7, 9, 10, 5, 8, 4, 2];

    for (let i = 0; i < 7; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    total = 11 - total % 11;
    if (total > 9) total = 0;

    return total === Number(vatnumber.slice(7, 8));
  }

  /** France - FR + 11 digits (or alphanumeric variants) */
  private static FRVATCheckDigit(vatnumber: string): boolean {
    if (!/^\d{11}$/.test(vatnumber)) return true;

    const total = Number(vatnumber.substring(2));
    const checkDigit = (total * 100 + 12) % 97;

    return checkDigit === Number(vatnumber.slice(0, 2));
  }

  /** UK - GB + various formats */
  private static GBVATCheckDigit(vatnumber: string): boolean {
    const multipliers = [8, 7, 6, 5, 4, 3, 2];

    // Government departments
    if (vatnumber.substr(0, 2) === 'GD') {
      return Number(vatnumber.substr(2, 3)) < 500;
    }

    // Health authorities
    if (vatnumber.substr(0, 2) === 'HA') {
      return Number(vatnumber.substr(2, 3)) > 499;
    }

    // Standard and commercial numbers
    if (Number(vatnumber.slice(0)) === 0) return false;

    const no = Number(vatnumber.slice(0, 7));
    let total = 0;

    for (let i = 0; i < 7; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    let cd = total;
    while (cd > 0) cd = cd - 97;
    cd = Math.abs(cd);

    if (cd === Number(vatnumber.slice(7, 9)) && no < 9990001 && 
        (no < 100000 || no > 999999) && (no < 9490001 || no > 9700000)) {
      return true;
    }

    // New method
    if (cd >= 55) {
      cd = cd - 55;
    } else {
      cd = cd + 42;
    }

    return cd === Number(vatnumber.slice(7, 9)) && no > 1000000;
  }

  /** Croatia - HR + 11 digits (ISO 7064, MOD 11-10) */
  private static HRVATCheckDigit(vatnumber: string): boolean {
    let product = 10;
    let sum = 0;

    for (let i = 0; i < 10; i++) {
      sum = (Number(vatnumber.charAt(i)) + product) % 10;
      if (sum === 0) sum = 10;
      product = (2 * sum) % 11;
    }

    return (product + Number(vatnumber.slice(10, 11))) % 10 === 1;
  }

  /** Hungary - HU + 8 digits */
  private static HUVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [9, 7, 3, 1, 9, 7, 3];

    for (let i = 0; i < 7; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    total = 10 - total % 10;
    if (total === 10) total = 0;

    return total === Number(vatnumber.slice(7, 8));
  }

  /** Ireland - IE + various formats */
  private static IEVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [8, 7, 6, 5, 4, 3, 2];

    let vat = vatnumber;
    // Convert old format to new
    if (/^\d[A-Z\*\+]/.test(vat)) {
      vat = "0" + vat.substring(2, 7) + vat.substring(0, 1) + vat.substring(7, 8);
    }

    for (let i = 0; i < 7; i++) {
      total += Number(vat.charAt(i)) * multipliers[i];
    }

    // Type 3 numbers include trailing A or H
    if (/^\d{7}[A-Z][AH]$/.test(vatnumber)) {
      if (vatnumber.charAt(8) === 'H') {
        total += 72;
      } else {
        total += 9;
      }
    }

    total = total % 23;
    let checkChar: string;
    if (total === 0) {
      checkChar = "W";
    } else {
      checkChar = String.fromCharCode(total + 64);
    }

    return checkChar === vat.slice(7, 8);
  }

  /** Italy - IT + 11 digits */
  private static ITVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
    let temp: number;

    if (Number(vatnumber.slice(0, 7)) === 0) return false;
    temp = Number(vatnumber.slice(7, 10));
    if ((temp < 1 || temp > 201) && temp !== 999 && temp !== 888) return false;

    for (let i = 0; i < 10; i++) {
      temp = Number(vatnumber.charAt(i)) * multipliers[i];
      if (temp > 9) {
        total += Math.floor(temp / 10) + temp % 10;
      } else {
        total += temp;
      }
    }

    total = 10 - total % 10;
    if (total > 9) total = 0;

    return total === Number(vatnumber.slice(10, 11));
  }

  /** Lithuania - LT + 9 or 12 digits */
  private static LTVATCheckDigit(vatnumber: string): boolean {
    if (vatnumber.length === 9) {
      // 8th character must be 1
      if (!/^\d{7}1/.test(vatnumber)) return false;

      let total = 0;
      for (let i = 0; i < 8; i++) {
        total += Number(vatnumber.charAt(i)) * (i + 1);
      }

      if (total % 11 === 10) {
        const multipliers = [3, 4, 5, 6, 7, 8, 9, 1];
        total = 0;
        for (let i = 0; i < 8; i++) {
          total += Number(vatnumber.charAt(i)) * multipliers[i];
        }
      }

      total = total % 11;
      if (total === 10) total = 0;

      return total === Number(vatnumber.slice(8, 9));
    }

    // 12 digit
    if (!/^\d{10}1/.test(vatnumber)) return false;

    let total = 0;
    let multipliers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2];

    for (let i = 0; i < 11; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    if (total % 11 === 10) {
      multipliers = [3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4];
      total = 0;
      for (let i = 0; i < 11; i++) {
        total += Number(vatnumber.charAt(i)) * multipliers[i];
      }
    }

    total = total % 11;
    if (total === 10) total = 0;

    return total === Number(vatnumber.slice(11, 12));
  }

  /** Luxembourg - LU + 8 digits */
  private static LUVATCheckDigit(vatnumber: string): boolean {
    return Number(vatnumber.slice(0, 6)) % 89 === Number(vatnumber.slice(6, 8));
  }

  /** Latvia - LV + 11 digits */
  private static LVVATCheckDigit(vatnumber: string): boolean {
    // Natural persons check
    if (/^[0-3]/.test(vatnumber)) {
      return /^[0-3][0-9][0-1][0-9]/.test(vatnumber);
    }

    let total = 0;
    const multipliers = [9, 1, 4, 8, 3, 10, 2, 5, 7, 6];

    for (let i = 0; i < 10; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    if (total % 11 === 4 && vatnumber[0] === '9') total = total - 45;

    if (total % 11 === 4) {
      total = 4 - total % 11;
    } else if (total % 11 > 4) {
      total = 14 - total % 11;
    } else if (total % 11 < 4) {
      total = 3 - total % 11;
    }

    return total === Number(vatnumber.slice(10, 11));
  }

  /** Malta - MT + 8 digits */
  private static MTVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [3, 4, 6, 7, 8, 9];

    for (let i = 0; i < 6; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    total = 37 - total % 37;

    return total === Number(vatnumber.slice(6, 8));
  }

  /** Netherlands - NL + 9 digits + B + 2 digits */
  private static NLVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [9, 8, 7, 6, 5, 4, 3, 2];

    for (let i = 0; i < 8; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    total = total % 11;
    if (total > 9) total = 0;

    return total === Number(vatnumber.slice(8, 9));
  }

  /** Norway - NO + 9 digits */
  private static NOVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [3, 2, 7, 6, 5, 4, 3, 2];

    for (let i = 0; i < 8; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    total = 11 - total % 11;
    if (total === 11) total = 0;
    if (total >= 10) return false;

    return total === Number(vatnumber.slice(8, 9));
  }

  /** Poland - PL + 10 digits */
  private static PLVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [6, 5, 7, 2, 3, 4, 5, 6, 7];

    for (let i = 0; i < 9; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    total = total % 11;
    if (total > 9) total = 0;

    return total === Number(vatnumber.slice(9, 10));
  }

  /** Portugal - PT + 9 digits */
  private static PTVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [9, 8, 7, 6, 5, 4, 3, 2];

    for (let i = 0; i < 8; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    total = 11 - total % 11;
    if (total > 9) total = 0;

    return total === Number(vatnumber.slice(8, 9));
  }

  /** Romania - RO + 2-10 digits */
  private static ROVATCheckDigit(vatnumber: string): boolean {
    let multipliers = [7, 5, 3, 2, 1, 7, 5, 3, 2];
    const VATlen = vatnumber.length;
    multipliers = multipliers.slice(10 - VATlen);

    let total = 0;
    for (let i = 0; i < vatnumber.length - 1; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    total = (10 * total) % 11;
    if (total === 10) total = 0;

    return total === Number(vatnumber.slice(vatnumber.length - 1, vatnumber.length));
  }

  /** Serbia - RS + 9 digits (ISO 7064, MOD 11-10) */
  private static RSVATCheckDigit(vatnumber: string): boolean {
    let product = 10;
    let sum = 0;

    for (let i = 0; i < 8; i++) {
      sum = (Number(vatnumber.charAt(i)) + product) % 10;
      if (sum === 0) sum = 10;
      product = (2 * sum) % 11;
    }

    return (product + Number(vatnumber.slice(8, 9))) % 10 === 1;
  }

  /** Russia - RU + 10 or 12 digits */
  private static RUVATCheckDigit(vatnumber: string): boolean {
    if (vatnumber.length === 10) {
      let total = 0;
      const multipliers = [2, 4, 10, 3, 5, 9, 4, 6, 8, 0];

      for (let i = 0; i < 10; i++) {
        total += Number(vatnumber.charAt(i)) * multipliers[i];
      }

      total = total % 11;
      if (total > 9) total = total % 10;

      return total === Number(vatnumber.slice(9, 10));
    }

    if (vatnumber.length === 12) {
      const multipliers1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8, 0];
      const multipliers2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8, 0];

      let total1 = 0;
      for (let i = 0; i < 11; i++) {
        total1 += Number(vatnumber.charAt(i)) * multipliers1[i];
      }
      total1 = total1 % 11;
      if (total1 > 9) total1 = total1 % 10;

      let total2 = 0;
      for (let i = 0; i < 11; i++) {
        total2 += Number(vatnumber.charAt(i)) * multipliers2[i];
      }
      total2 = total2 % 11;
      if (total2 > 9) total2 = total2 % 10;

      return total1 === Number(vatnumber.slice(10, 11)) && 
             total2 === Number(vatnumber.slice(11, 12));
    }

    return false;
  }

  /** Sweden - SE + 12 digits (ends with 01) */
  private static SEVATCheckDigit(vatnumber: string): boolean {
    // Calculate R = R1 + R3 + R5 + R7 + R9
    let R = 0;
    for (let i = 0; i < 9; i += 2) {
      const digit = Number(vatnumber.charAt(i));
      R += Math.floor(digit / 5) + ((digit * 2) % 10);
    }

    // Calculate S = C2 + C4 + C6 + C8
    let S = 0;
    for (let i = 1; i < 9; i += 2) {
      S += Number(vatnumber.charAt(i));
    }

    const cd = (10 - (R + S) % 10) % 10;

    return cd === Number(vatnumber.slice(9, 10));
  }

  /** Slovenia - SI + 8 digits */
  private static SIVATCheckDigit(vatnumber: string): boolean {
    let total = 0;
    const multipliers = [8, 7, 6, 5, 4, 3, 2];

    for (let i = 0; i < 7; i++) {
      total += Number(vatnumber.charAt(i)) * multipliers[i];
    }

    total = 11 - total % 11;
    if (total === 10) total = 0;

    return total !== 11 && total === Number(vatnumber.slice(7, 8));
  }

  /** Slovakia - SK + 10 digits */
  private static SKVATCheckDigit(vatnumber: string): boolean {
    return Number(vatnumber) % 11 === 0;
  }
}
