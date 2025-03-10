import DefaultLayout from "@/layouts/default";
import * as React from "react";
import { Button, Textarea } from "@heroui/react";
import validator from "validator"; // Для валидации текста
import DOMPurify from "dompurify";
import { Link } from "@heroui/link"; // Для очистки текста от опасного контента

// Максимальная длина сообщения для Telegram
const MAX_MESSAGE_LENGTH = 4096;

// Запрещенные слова (можно расширить)
const FORBIDDEN_WORDS = [];

// Время блокировки отправки (в миллисекундах)
const SEND_COOLDOWN = 60000; // 15 секунд

// Лимит запросов в минуту
const RATE_LIMIT = 5; // Максимум 5 запросов в минуту
const RATE_LIMIT_WINDOW = 60000; // 1 минута

// Хранение количества запросов по IP
const requestCounts = new Map();

function MessageForm() {
    const [message, setMessage] = React.useState("");
    const [error, setError] = React.useState("");
    const [submitted, setSubmitted] = React.useState(false);
    const [lastSendTime, setLastSendTime] = React.useState(null); // Время последней отправки
    const [cooldown, setCooldown] = React.useState(0); // Оставшееся время блокировки
    const [csrfToken, setCsrfToken] = React.useState('');
    React.useEffect(() => {
        fetch('/api/get-csrf-token')
            .then(response => response.json())
            .then(data => setCsrfToken(data.csrf_token));
    }, []);


    // React.useEffect(() => {
    //     fetch('/api/get-csrf-token')
    //         .then(response => response.json())
    //         .then(data => setCsrfToken(data.csrf_token));
    // }, []);

    // Проверка валидности сообщения
    const validateMessage = (text) => {
        if (!text || validator.isEmpty(text)) {
            return "Сообщение не может быть пустым.";
        }
        if (!validator.isLength(text, { max: MAX_MESSAGE_LENGTH })) {
            return `Сообщение слишком длинное. Максимум ${MAX_MESSAGE_LENGTH} символов.`;
        }

        const uniqueChars = new Set(text.replace(/\s/g, ""));
        if (uniqueChars.size < 2) {
            return "Сообщение содержит слишком много повторяющихся символов.";
        }
        const lowerCaseText = text.toLowerCase();
        for (const word of FORBIDDEN_WORDS) {
            if (lowerCaseText.includes(word)) {
                return `Сообщение содержит запрещенное слово: "${word}".`;
            }
        }
        // if (validator.isURL(text, { require_protocol: true })) {
        //     return "Сообщение содержит ссылки. Ссылки не разрешены.";
        // }
        return "";
    };

    // Обработка отправки формы
    const handleSubmit = async (e) => {
        e.preventDefault();

        // Проверка на блокировку отправки
        if (cooldown > 0) {
            setError(`Пожалуйста, подождите ${Math.ceil(cooldown / 1000)} секунд перед повторной отправкой.`);
            return;
        }

        // Проверка на лимит запросов
        const ip = await getClientIP(); // Получаем IP клиента
        if (isRateLimited(ip)) {
            setError("Слишком много запросов. Пожалуйста, попробуйте позже.");
            return;
        }

        const validationError = validateMessage(message);
        if (validationError) {
            setError(validationError);
            return;
        }

        // Очистка от потенциально опасного контента
        const sanitizedMessage = DOMPurify.sanitize(message, {
            ALLOWED_TAGS: [],
            ALLOWED_ATTR: [],
        });

        try {
            // Отправка сообщения на ваш сервер
            const response = await fetch("/api/add_message", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken
                },
                body: JSON.stringify({ content: sanitizedMessage }),
            });

            const result = await response.json();

            if (response.ok) {
                setSubmitted(true);
                setError("");
                setLastSendTime(Date.now()); // Запоминаем время отправки
                setCooldown(SEND_COOLDOWN); // Устанавливаем время блокировки

                // Отправка сообщения на api.centraluniverse.ru/message
                // await sendToCentralUniverse(sanitizedMessage);
            } else {
                // Обработка ошибок от API
                if (response.status === 429) {
                    setError("Слишком много запросов. Пожалуйста, попробуйте позже.");
                } else if (response.status === 400) {
                    setError(result.error || "Недопустимое сообщение.");
                } else {
                    setError("Произошла ошибка при отправке сообщения.");
                }
                console.error("Ошибка API:", result);
            }
        } catch (error) {
            setError("Произошла ошибка при отправке сообщения.");
            console.error("Ошибка сети:", error);
        }
    };

    // Функция для отправки сообщения на api.centraluniverse.ru/message
    const sendToCentralUniverse = async (text) => {
        try {
            const response = await fetch("https://api.centraluniverse.ru/message", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ message: text }), // Формат запроса
            });

            if (!response.ok) {
                console.error("Ошибка при отправке сообщения на api.centraluniverse.ru:", await response.text());
            }
        } catch (error) {
            console.error("Ошибка при отправке сообщения на api.centraluniverse.ru:", error);
        }
    };

    // Эффект для отслеживания времени блокировки
    React.useEffect(() => {
        if (cooldown > 0) {
            const timer = setInterval(() => {
                const timeSinceLastSend = Date.now() - lastSendTime;
                const remainingCooldown = SEND_COOLDOWN - timeSinceLastSend;

                if (remainingCooldown <= 0) {
                    setCooldown(0); // Сбрасываем блокировку
                    clearInterval(timer);
                } else {
                    setCooldown(remainingCooldown); // Обновляем оставшееся время
                }
            }, 1000);

            return () => clearInterval(timer); // Очистка таймера при размонтировании
        }
    }, [cooldown, lastSendTime]);

    // Функция для получения IP клиента
    const getClientIP = async () => {
        try {
            const response = await fetch("https://api.ipify.org?format=json");
            const data = await response.json();
            return data.ip;
        } catch (error) {
            console.error("Ошибка при получении IP:", error);
            return "unknown"; // Возвращаем значение по умолчанию
        }
    };

    // Функция для проверки лимита запросов
    const isRateLimited = (ip) => {
        const now = Date.now();
        const requestTimestamps = requestCounts.get(ip) || [];

        // Удаляем старые запросы
        const recentRequests = requestTimestamps.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);

        if (recentRequests.length >= RATE_LIMIT) {
            return true;
        }

        requestCounts.set(ip, [...recentRequests, now]);
        return false;
    };

    return (
        <DefaultLayout>
            <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
                <div className="w-full max-w-2xl p-6 bg-white shadow-lg rounded-lg">
                    <h1 className="text-2xl font-bold mb-4">Отправьте сообщение</h1>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Textarea
                            isRequired
                            label="Сообщение"
                            labelPlacement="outside"
                            name="message"
                            placeholder="Введите ваше сообщение..."
                            value={message}
                            onValueChange={(value) => {
                                setMessage(value);
                                setError("");
                            }}
                            maxLength={MAX_MESSAGE_LENGTH}
                            classNames={{
                                base: "",
                                input: "resize-y min-h-[250px]",
                            }}
                        />
                        {error && (
                            <div className="text-sm text-red-500 mt-2">
                                {error}
                            </div>
                        )}
                        <Button
                            type="submit"
                            color="primary"
                            className="w-full"
                            disabled={cooldown > 0} // Блокировка кнопки во время тайм-аута
                        >
                            {cooldown > 0 ? `Подождите ${Math.ceil(cooldown / 1000)} сек...` : "Отправить"}
                        </Button>
                    </form>
                    {submitted && (
                        <div className="mt-4 p-4 bg-green-100 text-green-800 rounded">
                            Сообщение успешно отправлено! Ожидайте проверки админом.
                        </div>
                    )}
                </div>
                <Link href="https://forms.yandex.ru/u/679d6d47068ff0ad531e30d9/">Форма обратной связи</Link>
            </section>
        </DefaultLayout>
    );
}

export default MessageForm;
