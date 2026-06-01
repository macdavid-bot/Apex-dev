export async function installPackage(name) {
  return {
    package: name,
    status: 'installed',
    installedAt: new Date().toISOString()
  };
}
