/**
 * Mengemas bukti dari format array menjadi array 8-elemen datar yang kompatibel dengan Solidity.
 * @param proof Bukti Semaphore dalam format array bigint.
 * @returns Bukti yang diformat sebagai array string datar [8].
 */
export function packToSolidityProof(proof: bigint[]): string[] {
    if (!proof || proof.length !== 8) {
        throw new Error("Fungsi packToSolidityProof menerima argumen 'proof' yang tidak valid!");
    }
    
    // Kontrak verifier mengharapkan elemen 'b' ditukar.
    // Urutan yang benar untuk verifier: [a.x, a.y, b.x.y, b.x.x, b.y.y, b.y.x, c.x, c.y]
    return [
        proof[0].toString(),
        proof[1].toString(),
        proof[3].toString(), // b.x.y
        proof[2].toString(), // b.x.x
        proof[5].toString(), // b.y.y
        proof[4].toString(), // b.y.x
        proof[6].toString(),
        proof[7].toString()
    ];
}