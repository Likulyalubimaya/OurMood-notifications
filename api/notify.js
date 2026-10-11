import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
        })
    });
}

const db = getFirestore();

export default async function handler(req, res) {
    // Разрешаем только POST
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const {
            pairId,
            userId,
            mood
        } = req.body || {};

        if (!pairId || !userId || !mood) {
            return res.status(400).json({
                error: "Не хватает данных"
            });
        }

        // Получаем пару из Firebase
        const pairRef = db.collection("pairs").doc(pairId);
        const pairSnap = await pairRef.get();

        if (!pairSnap.exists) {
            return res.status(404).json({
                error: "Пара не найдена"
            });
        }

        const pair = pairSnap.data();
        const members = pair.members || {};

        // Находим партнёра
        const partnerEntry = Object.entries(members)
            .find(([id]) => id !== userId);

        if (!partnerEntry) {
            return res.status(400).json({
                error: "Партнёр ещё не подключён"
            });
        }

        const partner = partnerEntry[1];

        if (!partner.telegramId) {
            return res.status(400).json({
                error: "У партнёра нет Telegram ID"
            });
        }

        const sender = members[userId];

        const senderName = sender?.name || "Партнёр";

        // Отправляем сообщение через Telegram
        const telegramResponse = await fetch(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    chat_id: partner.telegramId,
                    text: `💜 ${senderName} изменил(а) настроение:\n\n${mood}`
                })
            }
        );

        const telegramResult = await telegramResponse.json();

        if (!telegramResponse.ok) {
            console.error("Telegram error:", telegramResult);

            return res.status(500).json({
                error: "Telegram не отправил сообщение"
            });
        }

        return res.status(200).json({
            success: true
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Ошибка сервера"
        });
    }
}
