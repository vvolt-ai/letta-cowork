/**
 * DELETE ALL LETTA FOLDERS
 * ---------------------------------
 * ⚠️ This is destructive.
 * Run with DRY_RUN=true first.
 */

const BASE_URL = "https://letta.ngrok.app/v1";
const API_KEY = "letta-U8C7Jkwzp8ZlF1m6wU09DM7ZyxjaaRiO"; // set in env

if (!API_KEY) {
  console.error("❌ Missing LETTA_API_KEY environment variable");
  process.exit(1);
}

// Toggle this to false when ready
const DRY_RUN = true;

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    type: "basic",
    headers: {
      Authorization: `Bearer ${API_KEY}`
    },
  });

  console.log(res)
  if (res.status === 401) {
    console.error("❌ Unauthorized. Check API key.");
    process.exit(1);
  }

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getAllFolders() {
  console.log("📂 Fetching folders...");
  return await request(`${BASE_URL}/folders`);
}

async function deleteFolder(folderId, folderName) {
  if (DRY_RUN) {
    console.log(`🧪 [DRY RUN] Would delete: ${folderName} (${folderId})`);
    return;
  }

  console.log(`🗑 Deleting: ${folderName} (${folderId})`);

  const res = await fetch(`${BASE_URL}/folders/${folderId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  });

  if (!res.ok) {
    console.error(`❌ Failed to delete ${folderId} — Status: ${res.status}`);
  } else {
    console.log(`✅ Deleted: ${folderName}`);
  }
}

async function main() {
  try {
    const folders = await getAllFolders();

    if (!Array.isArray(folders) || folders.length === 0) {
      console.log("📭 No folders found.");
      return;
    }

    console.log(`⚠️ Found ${folders.length} folders\n`);

    for (const folder of folders) {
      await deleteFolder(folder.id, folder.name);
    }

    console.log("\n🏁 Done.");
    if (DRY_RUN) {
      console.log("⚠️ This was a dry run. Set DRY_RUN = false to actually delete.");
    }

  } catch (err) {
    console.error("💥 Fatal error:", err);
  }
}

main();