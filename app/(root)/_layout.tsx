import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";

export default function RootLayout() {
    const { isSignedIn, isLoaded } = useAuth();
    // sync Clerk user -> Supabse
    if (!isLoaded) return null;
    if (!isSignedIn) return <Redirect href={"/sign-in"} />;

    return <Stack />;
}