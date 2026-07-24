export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-4 text-center">
      <h1 className="text-xl font-semibold">Account inactive</h1>
      <p className="text-muted-foreground">
        Your account has been deactivated. Contact the owner or admin if this is unexpected.
      </p>
    </div>
  );
}
