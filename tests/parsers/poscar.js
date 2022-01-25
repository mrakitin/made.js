import { expect } from "chai";

import { Material } from "../../src/material";
import { atomsCount, getNameFromContents } from "../../src/parsers/poscar";
import { GenericPoscar, H2O, Na4Cl4, Na4Cl4Poscar, Zr1H23Zr1H1, Zr1H23Zr1H1Poscar } from "../enums";

describe("Parsers.POSCAR", () => {
    it("should return a valid poscar", () => {
        const material = new Material(Na4Cl4);
        expect(`${material.getAsPOSCAR()}\n`).to.be.equal(Na4Cl4Poscar);
    });

    it("should return poscar elements line according to id in basis, duplicate entries separate", () => {
        const material = new Material(Zr1H23Zr1H1);
        expect(`${material.getAsPOSCAR()}\n`).to.be.equal(Zr1H23Zr1H1Poscar);
    });

    it("should return the number of atoms for a molecule in a poscar file", () => {
        expect(atomsCount(H2O)).to.be.equal(3);
    });
    it("should return the material name based on the poscar file contents", () => {
        const fileContents = GenericPoscar;
        expect(getNameFromContents(fileContents)).to.be.equal("H2S");
    });
});
