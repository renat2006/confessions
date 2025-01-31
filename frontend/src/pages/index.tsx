import DefaultLayout from "@/layouts/default";
import * as React from "react";
import { Button, Textarea } from "@heroui/react";
import validator from "validator"; // Для валидации текста
import DOMPurify from "dompurify"; // Для очистки текста от опасного контента

// Максимальная длина сообщения для Telegram
const MAX_MESSAGE_LENGTH = 4096;

// Запрещенные слова (можно расширить)
const FORBIDDEN_WORDS = [];

// Время блокировки отправки (в миллисекундах)
const SEND_COOLDOWN = 15000; // 15 секунд

function MessageForm() {
    const [message, setMessage] = React.useState("");
    const [error, setError] = React.useState("");
    const [submitted, setSubmitted] = React.useState(false);
    const [lastSendTime, setLastSendTime] = React.useState(null); // Время последней отправки
    const [cooldown, setCooldown] = React.useState(0); // Оставшееся время блокировки

    // Проверка валидности сообщения
    const validateMessage = (text) => {
        if (!text || validator.isEmpty(text)) {
            return "Сообщение не может быть пустым.";
        }
        if (!validator.isLength(text, { max: MAX_MESSAGE_LENGTH })) {
            return `Сообщение слишком длинное. Максимум ${MAX_MESSAGE_LENGTH} символов.`;
        }
        if (!validator.isAscii(text) && !validator.matches(text, /^[\p{L}\p{N}\s.,!?\-()#№+{}'"`;:]+$/u)) {
            return "Сообщение содержит недопустимые символы. Разрешены только русские и английские буквы, цифры и стандартные знаки препинания.";
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
        if (validator.isURL(text, { require_protocol: true })) {
            return "Сообщение содержит ссылки. Ссылки не разрешены.";
        }
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
            // Отправка сообщения на сервер
            const response = await fetch("/apii/add_message", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ content: sanitizedMessage }),
            });

            const result = await response.json();

            if (response.ok) {
                setSubmitted(true);
                setError("");
                setLastSendTime(Date.now()); // Запоминаем время отправки
                setCooldown(SEND_COOLDOWN); // Устанавливаем время блокировки
            } else {
                setError(result.error || "Произошла ошибка при отправке сообщения.");
            }
        } catch (error) {
            setError("Произошла ошибка при отправке сообщения.");
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
            </section>
        </DefaultLayout>
    );
}

export default MessageForm;