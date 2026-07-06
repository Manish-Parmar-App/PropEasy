import PropertyCard from "@/components/PropertyCard";
import { supabase } from "@/lib/supabase";
import { Property } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

interface Message {
    id: string;
    sender: "user" | "bot";
    text: string;
    timestamp: Date;
    properties?: Property[];
}

export default function ChatScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const flatListRef = useRef<FlatList>(null);

    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();

    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            sender: "bot",
            text: "Hello! I am PropEasy Copilot 🤖. I can help you search for properties using natural language.\n\nTry asking me something like:\n• \"Find a 3 BHK in Mumbai under 2 Crore\"\n• \"Show me villas in Delhi\"\n• \"Apartments under 80 Lakhs\"",
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const [behavior, setBehavior] = useState<"padding" | "height" | undefined>(
        Platform.OS === "ios" ? "padding" : undefined
    );

    // Track keyboard state to adjust behavior and padding dynamically
    useEffect(() => {
        const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
            setBehavior(Platform.OS === "ios" ? "padding" : "padding");
            setKeyboardVisible(true);
        });
        const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
            setBehavior(Platform.OS === "ios" ? "padding" : undefined);
            setKeyboardVisible(false);
        });

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    // Scroll to end when messages update
    useEffect(() => {
        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
    }, [messages, loading]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMessageText = input.trim();
        setInput("");

        const userMessage: Message = {
            id: String(Date.now()),
            sender: "user",
            text: userMessageText,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setLoading(true);

        if (!apiKey) {
            setMessages((prev) => [
                ...prev,
                {
                    id: String(Date.now() + 1),
                    sender: "bot",
                    text: "Sorry, I cannot process your request. The Gemini API key is missing or not configured in this application.",
                    timestamp: new Date(),
                },
            ]);
            setLoading(false);
            return;
        }

        try {
            const prompt = `You are "PropEasy Copilot", a real estate assistant.
Your job is to assist the user in finding properties.
Analyze the user's input: "${userMessageText}"

Extract any search filters.
The allowed property types are exactly: "apartment", "house", "villa", "studio" (all lowercase).
For budget/prices: extract numbers in Indian Rupees (INR) (e.g. 1 Crore = 10000000, 50 Lakhs = 5000000).

Return ONLY a JSON object with this structure:
{
  "filters": {
    "city": string or null,
    "bedrooms": number or null,
    "maxPrice": number or null,
    "minPrice": number or null,
    "type": "apartment" | "house" | "villa" | "studio" | null
  },
  "reply": "A friendly conversational text response. Keep it concise (1-2 sentences). Summarize what filters you applied or ask for clarification."
}

Do not include any Markdown tags (like \`\`\`json) outside the JSON, do not include explanation, just valid JSON output.`;

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            responseMimeType: "application/json",
                        },
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const resJson = await response.json();
            let text = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                throw new Error("Empty response from Gemini API");
            }

            // Strip markdown block formats if Gemini wraps them
            text = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "");
            const parsed = JSON.parse(text.trim());

            const { filters, reply } = parsed;

            // Supabase Query
            let query = supabase.from("properties").select("*");

            if (filters?.city) {
                query = query.ilike("city", `%${filters.city}%`);
            }
            if (filters?.bedrooms) {
                query = query.eq("bedrooms", filters.bedrooms);
            }
            if (filters?.type) {
                query = query.eq("type", filters.type);
            }
            if (filters?.maxPrice) {
                query = query.lte("price", filters.maxPrice);
            }
            if (filters?.minPrice) {
                query = query.gte("price", filters.minPrice);
            }

            const { data: properties, error: dbError } = await query
                .order("created_at", { ascending: false })
                .limit(5);

            if (dbError) {
                console.error("Supabase error:", dbError);
            }

            let finalReply = reply;
            if (!properties || properties.length === 0) {
                finalReply += "\n\n*(Note: No matching properties were found in the database. Try adjusting your search criteria!)*";
            }

            const botMessage: Message = {
                id: String(Date.now() + 2),
                sender: "bot",
                text: finalReply,
                timestamp: new Date(),
                properties: properties || [],
            };

            setMessages((prev) => [...prev, botMessage]);
        } catch (error) {
            console.error("Chat error:", error);
            setMessages((prev) => [
                ...prev,
                {
                    id: String(Date.now() + 3),
                    sender: "bot",
                    text: "Sorry, I encountered an error while processing your request. Please try again.",
                    timestamp: new Date(),
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
            {/* Header */}
            <View className="flex-row items-center px-4 py-3 border-b border-gray-100 bg-white">
                <TouchableOpacity onPress={() => router.back()} className="p-1 mr-3">
                    <Ionicons name="arrow-back" size={24} color="#374151" />
                </TouchableOpacity>
                <View className="flex-1">
                    <View className="flex-row items-center gap-1.5">
                        <Text className="text-lg font-bold text-gray-900">PropEasy Copilot</Text>
                        <View className="bg-amber-500 rounded-full px-1.5 py-0.5">
                            <Text className="text-[10px] font-bold text-white uppercase">AI</Text>
                        </View>
                    </View>
                    <Text className="text-xs text-gray-500">powered by Gemini</Text>
                </View>
            </View>

            {/* Chat Body */}
            <KeyboardAvoidingView
                behavior={behavior}
                className="flex-1"
                keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
            >
                {/* Missing API Key Warning */}
                {!apiKey && (
                    <View className="bg-red-50 border border-red-100 rounded-2xl p-4 mx-5 mt-4">
                        <View className="flex-row items-center gap-2 mb-1.5">
                            <Ionicons name="warning" size={18} color="#EF4444" />
                            <Text className="text-red-800 font-bold text-sm">Gemini API Key Missing</Text>
                        </View>
                        <Text className="text-red-600 text-xs leading-5">
                            Please add <Text className="font-semibold">EXPO_PUBLIC_GEMINI_API_KEY=your_key</Text> to your <Text className="font-semibold">.env</Text> file to enable AI property search.
                        </Text>
                    </View>
                )}

                {/* Messages List */}
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => {
                        const isUser = item.sender === "user";
                        return (
                            <View className={`mb-5 ${isUser ? "items-end" : "items-start"}`}>
                                <View
                                    className={`px-4 py-3 rounded-2xl max-w-[85%] ${
                                        isUser ? "bg-blue-600 rounded-tr-none" : "bg-gray-100 rounded-tl-none"
                                    }`}
                                >
                                    <Text className={`text-base leading-6 ${isUser ? "text-white" : "text-gray-800"}`}>
                                        {item.text}
                                    </Text>
                                </View>

                                {/* Render Recommended Properties if present */}
                                {item.properties && item.properties.length > 0 && (
                                    <View className="w-full mt-4">
                                        <Text className="text-xs font-semibold text-gray-400 mb-2 px-1">
                                            Matching Properties:
                                        </Text>
                                        {item.properties.map((property: Property) => (
                                            <PropertyCard key={property.id} property={property} />
                                        ))}
                                    </View>
                                )}
                            </View>
                        );
                    }}
                />

                {/* Loading indicator */}
                {loading && (
                    <View className="flex-row items-center gap-2 px-5 py-2 mb-2">
                        <ActivityIndicator size="small" color="#F59E0B" />
                        <Text className="text-xs text-gray-400 italic">Copilot is thinking...</Text>
                    </View>
                )}

                {/* Input Panel */}
                <View
                    className="flex-row items-center px-4 py-3 bg-white border-t border-gray-100 gap-3"
                    style={{ paddingBottom: keyboardVisible ? 12 : Math.max(insets.bottom, 12) }}
                >
                    <TextInput
                        className="flex-1 bg-gray-50 rounded-2xl px-4 py-3 text-gray-800 border border-gray-100 text-sm max-h-24"
                        placeholder="Ask Copilot... (e.g. 3 BHK in Mumbai under 2Cr)"
                        placeholderTextColor="#9CA3AF"
                        value={input}
                        onChangeText={setInput}
                        multiline
                        editable={!loading}
                    />
                    <TouchableOpacity
                        onPress={handleSend}
                        disabled={loading || !input.trim()}
                        className={`w-12 h-12 rounded-2xl items-center justify-center ${
                            input.trim() ? "bg-blue-600" : "bg-gray-100"
                        }`}
                    >
                        <Ionicons name="send" size={18} color={input.trim() ? "white" : "#9CA3AF"} />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
