import { cleanupPiFiles } from "../lib/pi/file-store";

async function main() {
  const summary = await cleanupPiFiles();
  console.log(
    [
      "Pi file maintenance completed.",
      `expiredRecords=${summary.expiredRecords}`,
      `orphanedFiles=${summary.orphanedFiles}`,
    ].join(" "),
  );
}

main().catch((error) => {
  console.error("Pi file maintenance failed.", error);
  process.exit(1);
});
