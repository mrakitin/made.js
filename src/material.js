import { HasMetadataNamedDefaultableInMemoryEntity } from "@exabyte-io/code.js/dist/entity";
import CryptoJS from "crypto-js";
import lodash from "lodash";

import { ConstrainedBasis } from "./basis/constrained_basis";
import {
    isConventionalCellSameAsPrimitiveForLatticeType,
    PRIMITIVE_TO_CONVENTIONAL_CELL_LATTICE_TYPES,
    PRIMITIVE_TO_CONVENTIONAL_CELL_MULTIPLIERS,
} from "./cell/conventional_cell";
import { ATOMIC_COORD_UNITS, units } from "./constants";
import { Lattice } from "./lattice/lattice";
import { LATTICE_TYPE } from "./lattice/types";
import parsers from "./parsers/parsers";
import supercellTools from "./tools/supercell";

export const defaultMaterialConfig = {
    name: "Silicon FCC",
    basis: {
        elements: [
            {
                id: 1,
                value: "Si",
            },
            {
                id: 2,
                value: "Si",
            },
        ],
        coordinates: [
            {
                id: 1,
                value: [0.0, 0.0, 0.0],
            },
            {
                id: 2,
                value: [0.25, 0.25, 0.25],
            },
        ],
        units: ATOMIC_COORD_UNITS.crystal,
    },
    lattice: {
        // Primitive cell for Diamond FCC Silicon at ambient conditions
        type: LATTICE_TYPE.FCC,
        a: 3.867,
        b: 3.867,
        c: 3.867,
        alpha: 60,
        beta: 60,
        gamma: 60,
        units: {
            length: units.angstrom,
            angle: units.degree,
        },
    },
};

export class Material extends HasMetadataNamedDefaultableInMemoryEntity {
    constructor(config) {
        super(config);
        this._json = lodash.cloneDeep(config || {});
    }

    toJSON() {
        return this.toJSONDefault();
    }

    toJSONDefault() {
        return {
            lattice: this.Lattice.toJSON(),
            basis: this.Basis.toJSON(),
            name: this.name || this.formula,
            isNonPeriodic: this.isNonPeriodic || false,
        };
    }

    get name() {
        return super.name || this.formula;
    }

    set name(name) {
        super.name = name;
    }

    static get defaultConfig() {
        return defaultMaterialConfig;
    }

    updateFormula() {
        this.setProp("formula", this.Basis.formula);
        this.setProp("unitCellFormula", this.Basis.unitCellFormula);
    }

    /**
     * Gets Bolean value for whether or not a material is non-periodic vs periodic.
     * False = periodic, True = non-periodic
     */
    get isNonPeriodic() {
        return this.prop("isNonPeriodic", false, true);
    }

    /**
     * @summary Sets the value of isNonPeriodic based on Boolean value passed as an argument.
     * @param {Boolean} bool
     */
    set isNonPeriodic(bool) {
        this.setProp("isNonPeriodic", bool);
    }

    /**
     * @summary Returns the specific derived property (as specified by name) for a material.
     * @param {String} name
     * @returns {Object}
     */
    getDerivedPropertyByName(name) {
        return this.getDerivedProperties().find((x) => x.name === name);
    }

    /**
     * @summary Returns the derived properties array for a material.
     * @returns {Array}
     */
    getDerivedProperties() {
        return this.prop("derivedProperties", []);
    }

    /**
     * Gets material's formula
     */
    get formula() {
        return this.prop("formula") || this.Basis.formula;
    }

    get unitCellFormula() {
        return this.prop("unitCellFormula") || this.Basis.unitCellFormula;
    }

    /**
     * @param textOrObject {String} Basis text or JSON object.
     * @param format {String} Format (xyz, etc.)
     * @param unitz {String} crystal/cartesian
     */
    setBasis(textOrObject, format, unitz) {
        let basis;
        switch (format) {
            case "xyz":
                basis = parsers.xyz.toBasisConfig(textOrObject, unitz);
                break;
            default:
                basis = textOrObject;
        }
        this.setProp("basis", basis);
        this.updateFormula();
    }

    setBasisConstraints(constraints) {
        this.setBasis({
            ...this.basis,
            constraints,
        });
    }

    get basis() {
        return this.prop("basis", undefined, true);
    }

    // returns the instance of {ConstrainedBasis} class
    get Basis() {
        return new ConstrainedBasis({
            ...this.basis,
            cell: this.Lattice.vectorArrays,
        });
    }

    get lattice() {
        return this.prop("lattice", undefined, true);
    }

    set lattice(config) {
        this.setProp("lattice", config);
    }

    // returns the instance of {Lattice} class
    get Lattice() {
        return new Lattice(this.lattice);
    }

    /**
     * Returns the inchi string from the derivedProperties for a non-periodic material, or throws an error if the
     *  inchi cannot be found.
     *  @returns {String}
     */
    getInchiStringForHash() {
        const inchi = this.getDerivedPropertyByName("inchi");
        if (inchi) {
            return inchi.value;
        }
        throw new Error("Hash cannot be created. Missing InChI string in derivedProperties");
    }

    /**
     * Calculates hash from basis and lattice. Algorithm expects the following:
     * - asserts lattice units to be angstrom
     * - asserts basis units to be crystal
     * - asserts basis coordinates and lattice measurements are rounded to hash precision
     * - forms strings for lattice and basis
     * - creates MD5 hash from basisStr + latticeStr + salt
     * @param salt {String} Salt for hashing, empty string by default.
     * @param isScaled {Boolean} Whether to scale the lattice parameter 'a' to 1.
     */
    calculateHash(salt = "", isScaled = false, bypassNonPeriodicCheck = false) {
        let message;
        if (!this.isNonPeriodic || bypassNonPeriodicCheck) {
            message =
                this.Basis.hashString + "#" + this.Lattice.getHashString(isScaled) + "#" + salt;
        } else {
            message = this.getInchiStringForHash();
        }
        return CryptoJS.MD5(message).toString();
    }

    set hash(hash) {
        this.setProp("hash", hash);
    }

    get hash() {
        return this.prop("hash");
    }

    /**
     * Calculates hash from basis and lattice as above + scales lattice properties to make lattice.a = 1
     */
    get scaledHash() {
        return this.calculateHash("", true);
    }

    /**
     * Converts basis to crystal/fractional coordinates.
     */
    toCrystal() {
        const basis = this.Basis;
        basis.toCrystal();
        this.setProp("basis", basis.toJSON());
    }

    /**
     * Converts current material's basis coordinates to cartesian.
     * No changes if coordinates already cartesian.
     */
    toCartesian() {
        const basis = this.Basis;
        basis.toCartesian();
        this.setProp("basis", basis.toJSON());
    }

    /**
     * Returns material's basis in XYZ format.
     * @return {String}
     */
    getBasisAsXyz(fractional = false) {
        return parsers.xyz.fromMaterial(this.toJSON(), fractional);
    }

    /**
     * Returns material in Quantum Espresso output format:
     * ```
     *    CELL_PARAMETERS (angstroms)
     *    -0.543131284  -0.000000000   0.543131284
     *    -0.000000000   0.543131284   0.543131284
     *    -0.543131284   0.543131284   0.000000000
     *
     *    ATOMIC_POSITIONS (crystal)
     *    Si       0.000000000   0.000000000  -0.000000000
     *    Si       0.250000000   0.250000000   0.250000000
     * ```
     * @return {String}
     */
    getAsQEFormat() {
        return parsers.espresso.toEspressoFormat(this.toJSON());
    }

    /**
     * Returns material in POSCAR format. Pass `true` to ignore original poscar source and re-serialize.
     */
    getAsPOSCAR(ignoreOriginal = false, omitConstraints = false) {
        const { src } = this;
        // By default return original source if exists
        if (src && src.extension === "poscar" && !ignoreOriginal) {
            return this.src.text;
        }
        return parsers.poscar.toPoscar(this.toJSON(), omitConstraints);
    }

    /**
     * Returns a copy of the material with conventional cell constructed instead of primitive.
     */
    getACopyWithConventionalCell() {
        const material = this.clone();

        // if conventional and primitive cells are the same => return a copy.
        if (isConventionalCellSameAsPrimitiveForLatticeType(this.Lattice.type)) return material;

        const conventionalSupercellMatrix =
            PRIMITIVE_TO_CONVENTIONAL_CELL_MULTIPLIERS[this.Lattice.type];
        const conventionalLatticeType =
            PRIMITIVE_TO_CONVENTIONAL_CELL_LATTICE_TYPES[this.Lattice.type];
        const config = supercellTools.generateConfig(material, conventionalSupercellMatrix, 1);

        config.lattice.type = conventionalLatticeType;
        config.name = `${material.name} - conventional cell`;

        return new this.constructor(config);
    }
}
